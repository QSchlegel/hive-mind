import { getAuth } from "./better-auth";
import { getEnv } from "./env";
import { query } from "./db";

export const ACTIVE_BOT_COOKIE = "hm_active_bot_id";

export interface AccountSessionPayload {
  accountId: string;
  email: string;
  name: string;
  sessionId: string;
}

export interface SessionPayload extends AccountSessionPayload {
  botId: string;
  walletChain: "evm" | "cardano" | "bitcoin";
  walletAddress: string;
}

function parseCookieHeader(header: string | null): Map<string, string> {
  const out = new Map<string, string>();
  if (!header) {
    return out;
  }

  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    out.set(key, decodeURIComponent(value));
  }

  return out;
}

function getRequestedBotId(request: Request): string | null {
  const fromHeader = request.headers.get("x-active-bot-id");
  if (fromHeader) {
    return fromHeader.trim();
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const fromCookie = cookies.get(ACTIVE_BOT_COOKIE);
  return fromCookie ? fromCookie.trim() : null;
}

function parseAllowList(value: string | undefined): Set<string> {
  if (!value) {
    return new Set();
  }

  return new Set(
    value
      .split(/[,\n]/)
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

async function getRawSession(request: Request) {
  return getAuth().api.getSession({
    headers: request.headers
  });
}

export async function getAccountSession(request: Request): Promise<AccountSessionPayload | null> {
  const session = await getRawSession(request);
  if (!session?.user || !session.session) {
    return null;
  }

  return {
    accountId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    sessionId: session.session.id
  };
}

export async function requireAccountSession(request: Request): Promise<AccountSessionPayload> {
  const session = await getAccountSession(request);
  if (!session) {
    throw new Error("Missing authenticated account session");
  }
  return session;
}

export async function requireLinkedBot(request: Request, sourceBotId?: string): Promise<SessionPayload> {
  const account = await requireAccountSession(request);
  const requestedBotId = sourceBotId ?? getRequestedBotId(request);

  const linked = requestedBotId
    ? await query<{
        bot_id: string;
        wallet_chain: "evm" | "cardano" | "bitcoin";
        wallet_address: string;
      }>(
        `select awl.bot_id, b.wallet_chain, b.wallet_address
         from account_wallet_links awl
         join bots b on b.id = awl.bot_id
         where awl.account_id = $1
           and awl.bot_id = $2
         limit 1`,
        [account.accountId, requestedBotId]
      )
    : await query<{
        bot_id: string;
        wallet_chain: "evm" | "cardano" | "bitcoin";
        wallet_address: string;
      }>(
        `select awl.bot_id, b.wallet_chain, b.wallet_address
         from account_wallet_links awl
         join bots b on b.id = awl.bot_id
         where awl.account_id = $1
         order by awl.linked_at asc
         limit 1`,
        [account.accountId]
      );

  if (!linked.rowCount) {
    throw new Error("No linked bot found for this account");
  }

  return {
    ...account,
    botId: linked.rows[0].bot_id,
    walletChain: linked.rows[0].wallet_chain,
    walletAddress: linked.rows[0].wallet_address
  };
}

export async function requireSession(request: Request): Promise<SessionPayload> {
  return requireLinkedBot(request);
}

export async function requireAdminTreasuryAccess(request: Request): Promise<AccountSessionPayload> {
  const account = await requireAccountSession(request);
  const env = getEnv();

  const allowedEmails = parseAllowList(env.TREASURY_ADMIN_EMAIL_ALLOWLIST);
  const allowedWallets = parseAllowList(env.TREASURY_ADMIN_WALLET_ALLOWLIST);

  const emailAllowed = allowedEmails.size > 0 && allowedEmails.has(account.email.toLowerCase());
  if (emailAllowed) {
    return account;
  }

  if (allowedWallets.size > 0) {
    const wallet = await query<{ wallet_address: string }>(
      `select wallet_address
       from account_wallet_links
       where account_id = $1`,
      [account.accountId]
    );

    const walletAllowed = wallet.rows.some((row) => allowedWallets.has(row.wallet_address.toLowerCase()));
    if (walletAllowed) {
      return account;
    }
  }

  throw new Error("Treasury admin access denied");
}
