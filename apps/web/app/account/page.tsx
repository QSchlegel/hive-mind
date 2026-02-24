"use client";

import JSZip from "jszip";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { authClient } from "@/lib/better-auth-client";

type WalletChain = "evm" | "cardano" | "bitcoin";
type Section = "bots" | "stats" | "treasury";
type BotsTab = "history" | "wallets" | "callbacks";
type StatsTab = "overview" | "financials" | "funds";
type TreasuryTab = "overview" | "create" | "vote";
type RangeKey = "7d" | "30d" | "90d" | "all";
type CallbackFilter = "all" | "failed" | "dead_letter";

const DEFAULT_TAB: Record<Section, BotsTab | StatsTab | TreasuryTab> = {
  bots: "history",
  stats: "overview",
  treasury: "overview"
};

const SECTION_TABS = {
  bots: ["history", "wallets", "callbacks"] as const,
  stats: ["overview", "financials", "funds"] as const,
  treasury: ["overview", "create", "vote"] as const
};

const rangeOptions: RangeKey[] = ["7d", "30d", "90d", "all"];

interface AccountWallet {
  bot_id: string;
  wallet_chain: WalletChain;
  wallet_address: string;
  display_label: string | null;
  xp_balance: number;
  credit_balance_micro_eur: number;
  credit_balance_eur: number;
  linked_at: string;
}

interface AccountMeResponse {
  account: {
    id: string;
    email: string;
    name: string;
  };
  linked_wallets: AccountWallet[];
  active_bot_id: string | null;
  balances: {
    total_xp: number;
    total_credit_micro_eur: number;
    total_credit_eur: number;
  };
}

interface ProposalRow {
  id: string;
  title: string;
  summary: string | null;
  status: "open" | "approved" | "rejected" | "funded" | "cancelled";
  requested_eur: number;
  yes_xp: number;
  no_xp: number;
  vote_quorum_xp: number;
  voting_deadline: string;
  voting_open: boolean;
}

interface TreasuryState {
  treasury: {
    account: {
      provider: string;
      status: string;
      balance_eur: number;
      currency: string;
    };
    contributions: {
      confirmed_count: number;
      unique_contributor_accounts: number;
      confirmed_eur: number;
    };
    proposals: {
      open_count: number;
      open_expired_count: number;
      approved_count: number;
      rejected_count: number;
      funded_count: number;
      total_voted_xp: number;
      reserved_eur: number;
    };
    payouts: {
      count: number;
      total_eur: number;
    };
    available_eur: number;
  };
}

interface CallbackConfig {
  id: string;
  bot_id: string;
  endpoint_url: string;
  enabled: boolean;
  events: {
    note_created: boolean;
    note_edited: boolean;
  };
  updated_at: string;
}

interface CallbackDelivery {
  id: string;
  note_id: string;
  note_version_id: string;
  event_type: "note.created" | "note.edited";
  status: "queued" | "processing" | "delivered" | "failed" | "dead_letter";
  attempts: number;
  available_at: string;
  delivered_at: string | null;
  last_http_status: number | null;
  last_error: string | null;
  created_at: string;
}

interface BotJwtResult {
  bot_id: string;
  wallet_chain: WalletChain;
  wallet_address: string;
  label?: string;
  expiry?: "1m" | "1y" | "never";
  expires_at: string;
  bot_jwt: string;
}

interface LedgerResponse {
  scope: {
    account_id: string;
    bot_id: string | null;
    range: RangeKey;
    since: string | null;
    limit: number;
  };
  totals: {
    eur_inflow: number;
    eur_outflow: number;
    eur_net: number;
    xp_inflow: number;
    xp_outflow: number;
    xp_net: number;
    entry_count: number;
  };
  entries: Array<{
    id: string;
    bot_id: string;
    bot: {
      wallet_chain: WalletChain;
      wallet_address: string;
    };
    entry_type: string;
    amount_micro_eur_signed: number;
    amount_eur_signed: number;
    amount_xp_signed: number;
    reference_type: string | null;
    reference_id: string | null;
    created_at: string;
  }>;
}

interface AnalyticsResponse {
  scope: {
    account_id: string;
    bot_id: string | null;
    range: RangeKey;
    since: string | null;
    bucket: "day" | "week";
  };
  kpis: {
    linked_bot_count: number;
    total_xp_balance: number;
    total_credit_micro_eur: number;
    total_credit_eur: number;
    entry_count: number;
    eur_inflow: number;
    eur_outflow: number;
    eur_net: number;
    xp_inflow: number;
    xp_outflow: number;
    xp_net: number;
  };
  timeseries: {
    cashflow: Array<{
      bucket: string;
      topup_eur: number;
      write_spend_eur: number;
      edit_spend_eur: number;
      cashback_eur: number;
      inflow_eur: number;
      outflow_eur: number;
      net_eur: number;
    }>;
    xp: Array<{
      bucket: string;
      minted_xp: number;
      endorse_spend_xp: number;
      treasury_vote_spend_xp: number;
      inflow_xp: number;
      outflow_xp: number;
      net_xp: number;
    }>;
  };
  breakdown: Array<{
    entry_type: string;
    entry_count: number;
    eur_inflow: number;
    eur_outflow: number;
    eur_net: number;
    xp_inflow: number;
    xp_outflow: number;
    xp_net: number;
  }>;
  social: {
    callback_jobs_total: number;
    callback_jobs_delivered: number;
    callback_jobs_failed: number;
    callback_jobs_dead_letter: number;
    callback_jobs_pending: number;
    callback_delivery_success_rate: number | null;
  };
  funding_panel: {
    total_topup_eur: number;
    write_edit_spend_eur: number;
    cashback_eur: number;
    available_credit_eur: number;
    coverage_ratio: number | null;
  };
}

function parseSection(value: string | null): Section {
  if (value === "bots" || value === "stats" || value === "treasury") {
    return value;
  }
  return "bots";
}

function parseRange(value: string | null): RangeKey {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") {
    return value;
  }
  return "30d";
}

function parseTab(section: Section, value: string | null): BotsTab | StatsTab | TreasuryTab {
  const tabs = SECTION_TABS[section] as readonly string[];
  if (value && tabs.includes(value)) {
    return value as BotsTab | StatsTab | TreasuryTab;
  }
  return DEFAULT_TAB[section];
}

function isUuid(value: string | null): value is string {
  if (!value) {
    return false;
  }
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function shortAddress(address: string): string {
  if (address.length <= 20) {
    return address;
  }
  return `${address.slice(0, 10)}...${address.slice(-8)}`;
}

function formatEntryType(entryType: string): string {
  return entryType.replace(/_/g, " ");
}

function formatSigned(value: number): string {
  if (value > 0) {
    return `+${value.toLocaleString()}`;
  }
  return value.toLocaleString();
}

function formatSignedEur(value: number): string {
  const amount = Math.abs(value).toFixed(4);
  if (value > 0) {
    return `+${amount} EUR`;
  }
  if (value < 0) {
    return `-${amount} EUR`;
  }
  return `0.0000 EUR`;
}

interface TrendSeries {
  key: string;
  label: string;
  color: string;
  dotClassName: string;
}

type TrendPoint = {
  bucket: string;
  [key: string]: string | number;
};

function buildPath(values: number[], width: number, height: number, min: number, max: number): string {
  if (values.length === 0) {
    return "";
  }

  const safeMax = max === min ? max + 1 : max;
  return values
    .map((value, index) => {
      const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / (safeMax - min)) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function TrendChart({ data, series }: { data: TrendPoint[]; series: TrendSeries[] }) {
  if (!data.length) {
    return <p className="mb-0">No data in this range yet.</p>;
  }

  const width = 640;
  const height = 220;
  const values = data.flatMap((point) => series.map((item) => Number(point[item.key] ?? 0)));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);

  return (
    <div className="trend-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Trend chart">
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={0}
            x2={width}
            y1={ratio * height}
            y2={ratio * height}
            stroke="color-mix(in srgb, var(--border) 60%, transparent)"
            strokeDasharray="5 6"
          />
        ))}
        {series.map((item) => {
          const points = data.map((point) => Number(point[item.key] ?? 0));
          const path = buildPath(points, width, height, min, max);
          return <path key={item.key} d={path} fill="none" stroke={item.color} strokeWidth="2.25" strokeLinecap="round" />;
        })}
      </svg>

      <div className="trend-legend">
        {series.map((item) => (
          <span key={item.key}>
            <i className={item.dotClassName} /> {item.label}
          </span>
        ))}
      </div>

      <div className="trend-bounds">
        <span>{data[0]?.bucket}</span>
        <span>{data[data.length - 1]?.bucket}</span>
      </div>
    </div>
  );
}

function AccountPageClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, isPending } = authClient.useSession();

  const section = parseSection(searchParams.get("section"));
  const tab = parseTab(section, searchParams.get("tab"));
  const range = parseRange(searchParams.get("range"));
  const botFilterId = isUuid(searchParams.get("bot")) ? searchParams.get("bot") : null;
  const fundedParam = searchParams.get("funded");

  const [accountState, setAccountState] = useState<AccountMeResponse | null>(null);
  const [wallets, setWallets] = useState<AccountWallet[]>([]);
  const [activeBotId, setActiveBotId] = useState<string>("");
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [treasury, setTreasury] = useState<TreasuryState["treasury"] | null>(null);

  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);

  const [loadingBase, setLoadingBase] = useState(false);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fundAmount, setFundAmount] = useState("25");
  const [newProposal, setNewProposal] = useState({
    title: "",
    summary: "",
    description_md: "",
    requested_amount_eur: "250",
    voting_window_hours: "168"
  });
  const [voteDraft, setVoteDraft] = useState({
    proposal_id: "",
    vote: "yes" as "yes" | "no",
    xp_spent: "100"
  });

  const [callbackDraft, setCallbackDraft] = useState({
    endpoint_url: "",
    enabled: true,
    events: {
      note_created: true,
      note_edited: true
    }
  });
  const [callbackConfig, setCallbackConfig] = useState<CallbackConfig | null>(null);
  const [callbackSecret, setCallbackSecret] = useState<string | null>(null);
  const [callbackDeliveries, setCallbackDeliveries] = useState<CallbackDelivery[]>([]);
  const [callbackStatusFilter, setCallbackStatusFilter] = useState<CallbackFilter>("failed");
  const [connectDraft, setConnectDraft] = useState({
    label: "",
    expiry: "1y" as "1m" | "1y" | "never"
  });
  const [botJwtResult, setBotJwtResult] = useState<BotJwtResult | null>(null);
  const [showInstructionsPreview, setShowInstructionsPreview] = useState(false);
  const [updatingJwtBotId, setUpdatingJwtBotId] = useState<string | null>(null);

  const isAuthed = Boolean(session?.user);

  const updateQuery = useCallback(
    (updates: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (!value) {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      const query = next.toString();
      router.replace(query ? `/account?${query}` : "/account", { scroll: false });
    },
    [router, searchParams]
  );

  const selectSection = useCallback(
    (next: Section) => {
      updateQuery({ section: next, tab: DEFAULT_TAB[next] });
    },
    [updateQuery]
  );

  const selectTab = useCallback(
    (nextTab: string) => {
      updateQuery({ section, tab: nextTab });
    },
    [section, updateQuery]
  );

  const selectBotFilter = useCallback(
    (nextBot: string) => {
      updateQuery({ bot: nextBot === "all" ? null : nextBot });
    },
    [updateQuery]
  );

  const selectRange = useCallback(
    (nextRange: RangeKey) => {
      updateQuery({ range: nextRange });
    },
    [updateQuery]
  );

  const refreshCallbacks = useCallback(
    async (filter: CallbackFilter = callbackStatusFilter) => {
      if (!activeBotId) {
        setCallbackConfig(null);
        setCallbackSecret(null);
        setCallbackDeliveries([]);
        return;
      }

      const [callbackRes, deliveriesRes] = await Promise.all([
        fetch("/api/account/bot-callback"),
        fetch(`/api/account/bot-callback/deliveries?status=${filter}&limit=20`)
      ]);

      const callbackBody = await callbackRes.json();
      const deliveriesBody = await deliveriesRes.json();

      if (!callbackRes.ok) {
        throw new Error(callbackBody.error ?? "Could not load callback config");
      }
      if (!deliveriesRes.ok) {
        throw new Error(deliveriesBody.error ?? "Could not load callback deliveries");
      }

      const config = (callbackBody.callback ?? null) as CallbackConfig | null;
      setCallbackConfig(config);
      setCallbackDeliveries((deliveriesBody.deliveries ?? []) as CallbackDelivery[]);
      setCallbackDraft({
        endpoint_url: config?.endpoint_url ?? "",
        enabled: config?.enabled ?? true,
        events: {
          note_created: config?.events.note_created ?? true,
          note_edited: config?.events.note_edited ?? true
        }
      });
    },
    [activeBotId, callbackStatusFilter]
  );

  const refreshBase = useCallback(async () => {
    if (!isAuthed) {
      return;
    }

    setLoadingBase(true);
    setError(null);

    try {
      const [meRes, proposalsRes, treasuryRes] = await Promise.all([
        fetch("/api/account/me"),
        fetch("/api/treasury/proposals"),
        fetch("/api/treasury")
      ]);

      const meBody = await meRes.json();
      const proposalsBody = await proposalsRes.json();
      const treasuryBody = await treasuryRes.json();

      if (!meRes.ok) {
        throw new Error(meBody.error ?? "Could not fetch account state");
      }
      if (!proposalsRes.ok) {
        throw new Error(proposalsBody.error ?? "Could not fetch treasury proposals");
      }
      if (!treasuryRes.ok) {
        throw new Error(treasuryBody.error ?? "Could not fetch treasury overview");
      }

      const me = meBody as AccountMeResponse;
      const linkedWallets = me.linked_wallets ?? [];
      const nextActiveBotId = me.active_bot_id ?? linkedWallets[0]?.bot_id ?? "";

      setAccountState(me);
      setWallets(linkedWallets);
      setActiveBotId(nextActiveBotId);
      setProposals((proposalsBody.proposals ?? []) as ProposalRow[]);
      setTreasury((treasuryBody.treasury ?? null) as TreasuryState["treasury"] | null);

      if (linkedWallets.length === 0) {
        setCallbackConfig(null);
        setCallbackSecret(null);
        setCallbackDeliveries([]);
        setCallbackDraft({
          endpoint_url: "",
          enabled: true,
          events: {
            note_created: true,
            note_edited: true
          }
        });
      }
    } finally {
      setLoadingBase(false);
    }
  }, [isAuthed]);

  const refreshLedger = useCallback(async () => {
    if (!isAuthed) {
      return;
    }

    setLoadingLedger(true);
    try {
      const params = new URLSearchParams({ range, limit: "200" });
      if (botFilterId) {
        params.set("bot_id", botFilterId);
      }

      const response = await fetch(`/api/account/ledger?${params.toString()}`);
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Could not fetch account ledger");
      }

      setLedger(body as LedgerResponse);
    } finally {
      setLoadingLedger(false);
    }
  }, [isAuthed, range, botFilterId]);

  const refreshAnalytics = useCallback(async () => {
    if (!isAuthed) {
      return;
    }

    setLoadingAnalytics(true);
    try {
      const params = new URLSearchParams({ range });
      if (botFilterId) {
        params.set("bot_id", botFilterId);
      }

      const response = await fetch(`/api/account/analytics?${params.toString()}`);
      const body = await response.json();

      if (!response.ok) {
        throw new Error(body.error ?? "Could not fetch account analytics");
      }

      setAnalytics(body as AnalyticsResponse);
    } finally {
      setLoadingAnalytics(false);
    }
  }, [isAuthed, range, botFilterId]);

  useEffect(() => {
    if (!isAuthed) {
      return;
    }

    refreshBase().catch((loadError) => {
      setLoadingBase(false);
      setError(loadError instanceof Error ? loadError.message : "Could not load account data");
    });
  }, [isAuthed, refreshBase]);

  useEffect(() => {
    if (!isAuthed || section !== "bots") {
      return;
    }

    refreshLedger().catch((loadError) => {
      setLoadingLedger(false);
      setError(loadError instanceof Error ? loadError.message : "Could not load ledger");
    });
  }, [isAuthed, section, refreshLedger]);

  useEffect(() => {
    if (!isAuthed || section !== "stats") {
      return;
    }

    refreshAnalytics().catch((loadError) => {
      setLoadingAnalytics(false);
      setError(loadError instanceof Error ? loadError.message : "Could not load analytics");
    });
  }, [isAuthed, section, refreshAnalytics]);

  useEffect(() => {
    if (!isAuthed || section !== "bots" || wallets.length === 0) {
      return;
    }

    refreshCallbacks().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load callback data");
    });
  }, [isAuthed, section, wallets.length, refreshCallbacks]);

  useEffect(() => {
    if (!botFilterId || wallets.length === 0) {
      return;
    }

    const linked = wallets.some((wallet) => wallet.bot_id === botFilterId);
    if (!linked) {
      updateQuery({ bot: null });
    }
  }, [botFilterId, wallets, updateQuery]);

  const topupSuccessUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "http://127.0.0.1:3000/account?section=stats&tab=funds&funded=1";
    }
    return `${window.location.origin}/account?section=stats&tab=funds&funded=1`;
  }, []);

  const topupCancelUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return "http://127.0.0.1:3000/account?section=stats&tab=funds&funded=0";
    }
    return `${window.location.origin}/account?section=stats&tab=funds&funded=0`;
  }, []);

  const nextBotLabelPlaceholder = useMemo(() => {
    const botNums = wallets
      .map((w) => w.display_label?.match(/^bot-(\d+)$/i))
      .filter((m): m is RegExpMatchArray => m != null)
      .map((m) => parseInt(m[1], 10));
    const next = botNums.length > 0 ? Math.max(...botNums) + 1 : 1;
    return `e.g. bot-${String(next).padStart(2, "0")}`;
  }, [wallets]);

  async function updateActiveBotContext(botId: string): Promise<void> {
    const response = await fetch("/api/account/active-bot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bot_id: botId })
    });
    const body = await response.json();

    if (!response.ok) {
      throw new Error(body.error ?? "Could not set active bot");
    }
  }

  async function setActiveBot(botId: string) {
    setError(null);
    setMessage("Updating active bot...");

    try {
      await updateActiveBotContext(botId);
      setMessage("Active bot updated.");
      await refreshBase();

      if (section === "bots") {
        await refreshCallbacks();
      }
    } catch (refreshError) {
      setMessage(null);
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh account state");
    }
  }

  async function connectBotCreateJwt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Creating bot and BotJwt...");

    const jwtResponse = await fetch("/api/account/bot-jwt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: connectDraft.label.trim() || undefined,
        expiry: connectDraft.expiry
      })
    });
    const jwtBody = await jwtResponse.json();

    if (!jwtResponse.ok) {
      setMessage(null);
      setError(jwtBody.error ?? "Could not create BotJwt");
      return;
    }

    setBotJwtResult(jwtBody as BotJwtResult);
    try {
      await updateActiveBotContext((jwtBody as BotJwtResult).bot_id);
      await refreshBase();
      setMessage("Bot created and set as active. Copy your token below or set up callbacks in the next tab.");
    } catch (refreshError) {
      setMessage("Bot created. Copy your token below; set it as active in Wallets to use callbacks.");
      try {
        await refreshBase();
      } catch {
        // non-fatal
      }
    }
  }

  async function copyBotJwt() {
    if (!botJwtResult?.bot_jwt || !navigator?.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(botJwtResult.bot_jwt);
      setMessage("BotJwt copied to clipboard.");
    } catch {
      setError("Could not copy BotJwt to clipboard.");
    }
  }

  async function updateJwtForBot(wallet: AccountWallet) {
    setError(null);
    setMessage(null);
    setUpdatingJwtBotId(wallet.bot_id);
    try {
      const response = await fetch("/api/account/bot-jwt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bot_id: wallet.bot_id,
          expires_in_hours: 24 * 365
        })
      });
      const body = await response.json();
      if (!response.ok) {
        setError(body.error ?? "Could not update JWT");
        return;
      }
      setBotJwtResult({
        ...(body as BotJwtResult),
        label: wallet.display_label ?? undefined
      });
      setMessage("New BotJwt created. Copy or download it above.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update JWT");
    } finally {
      setUpdatingJwtBotId(null);
    }
  }

  function botLabelToFilename(label: string | undefined): string {
    if (!label?.trim()) return "bot";
    return label.trim().replace(/[^a-zA-Z0-9-_]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "bot";
  }

  function buildHivemindMd(result: BotJwtResult, apiBaseUrl?: string): string {
    const base = apiBaseUrl ?? "https://your-hive-mind-instance.com";
    const expLine =
      result.expiry === "never"
        ? "- **Expiry:** Never (long-lived token)"
        : `- **Expiry:** ${new Date(result.expires_at).toLocaleString()}`;
    const labelLine = result.label ? `- **Bot label:** ${result.label}` : "";
    return `# Hive Mind Bot JWT – Setup

Use this token for headless bot runtime authentication against the Hive Mind API.

## Files in this folder

- \`hive-mind-${botLabelToFilename(result.label)}.jwt\` – Your bot token. **Store securely and never commit to version control.**

## Quick start

1. **API base URL** – Send all requests to:
   \`\`\`
   ${base}
   \`\`\`

2. **Store the token** in an environment variable, e.g.:
   \`\`\`bash
   export HIVE_MIND_BOT_JWT="<paste token from the .jwt file>"
   \`\`\`

3. **Use in API requests** – Add the \`Authorization\` header to every request:
   \`\`\`
   Authorization: Bearer <your-bot-jwt>
   \`\`\`

4. **First request** – Check that your token works:
   \`\`\`
   GET ${base}/api/account/me
   \`\`\`

5. **More information** – Full API and docs:
   - [${base}/docs](${base}/docs) – Wallet quickstart, action signing, callbacks
   - [${base}/app](${base}/app) – API reference and endpoint list

6. **Rotate before expiry** – Get a new token with your current one:
   \`\`\`
   POST ${base}/api/account/bot-jwt/rotate
   Authorization: Bearer <your-current-bot-jwt>
   \`\`\`
   Optional body: \`{ "expires_in_hours": 168 }\` (default 1 week).

## This token

${labelLine ? `${labelLine}\n\n` : ""}${expLine}

> **Security:** Treat the JWT as a secret. Rotate it from the account dashboard if compromised.
`;
  }

  async function downloadWithInstructions() {
    if (!botJwtResult?.bot_jwt) return;
    setError(null);
    try {
      const baseName = botLabelToFilename(botJwtResult.label);
      const jwtFilename = `hive-mind-${baseName}.jwt`;
      const zip = new JSZip();
      zip.file(jwtFilename, botJwtResult.bot_jwt);
      const apiBase = typeof window !== "undefined" ? window.location.origin : undefined;
      zip.file("hivemind.md", buildHivemindMd(botJwtResult, apiBase));
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hive-mind-${baseName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage("Downloaded folder with JWT and instructions.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create download.");
    }
  }

  async function onTopupCredits(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Creating credit checkout...");

    const response = await fetch("/api/stripe/create-checkout-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        amount_eur: Number(fundAmount),
        success_url: topupSuccessUrl,
        cancel_url: topupCancelUrl
      })
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not create credit checkout");
      return;
    }

    if (body.checkout_url) {
      window.location.href = body.checkout_url;
      return;
    }

    setMessage("Checkout created.");
  }

  async function onCreateProposal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Creating proposal...");

    const response = await fetch("/api/treasury/proposals", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: newProposal.title,
        summary: newProposal.summary || undefined,
        description_md: newProposal.description_md,
        requested_amount_eur: Number(newProposal.requested_amount_eur),
        voting_window_hours: Number(newProposal.voting_window_hours),
        source_bot_id: activeBotId || undefined
      })
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not create proposal");
      return;
    }

    try {
      setMessage("Proposal created.");
      setNewProposal({
        title: "",
        summary: "",
        description_md: "",
        requested_amount_eur: "250",
        voting_window_hours: "168"
      });
      await refreshBase();
    } catch (refreshError) {
      setMessage(null);
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh account state");
    }
  }

  async function onVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Submitting vote...");

    const response = await fetch(`/api/treasury/proposals/${voteDraft.proposal_id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vote: voteDraft.vote,
        xp_spent: Number(voteDraft.xp_spent),
        source_bot_id: activeBotId
      })
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not cast vote");
      return;
    }

    try {
      setMessage("Vote submitted.");
      await refreshBase();
      if (section === "stats") {
        await refreshAnalytics();
      }
    } catch (refreshError) {
      setMessage(null);
      setError(refreshError instanceof Error ? refreshError.message : "Could not refresh account state");
    }
  }

  async function saveCallbackConfig(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage("Saving callback config...");

    const response = await fetch("/api/account/bot-callback", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(callbackDraft)
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not save callback config");
      return;
    }

    setCallbackConfig((body.callback ?? null) as CallbackConfig | null);
    setCallbackSecret((body.signing_secret as string | null) ?? null);
    setMessage("Callback config saved.");
    await refreshCallbacks();
  }

  async function rotateCallbackSecret() {
    setError(null);
    setMessage("Rotating callback secret...");

    const response = await fetch("/api/account/bot-callback/secret/rotate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not rotate callback secret");
      return;
    }

    setCallbackConfig((body.callback ?? null) as CallbackConfig | null);
    setCallbackSecret((body.signing_secret as string | null) ?? null);
    setMessage("Callback secret rotated.");
  }

  async function copyCallbackSecret() {
    if (!callbackSecret || !navigator?.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(callbackSecret);
      setMessage("Callback secret copied to clipboard.");
    } catch {
      setError("Could not copy callback secret to clipboard.");
    }
  }

  async function requeueDelivery(deliveryId: string) {
    setError(null);
    setMessage("Requeueing callback delivery...");

    const response = await fetch(`/api/account/bot-callback/deliveries/${deliveryId}/requeue`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({})
    });
    const body = await response.json();

    if (!response.ok) {
      setMessage(null);
      setError(body.error ?? "Could not requeue callback delivery");
      return;
    }

    setMessage("Callback delivery requeued.");
    await refreshCallbacks(callbackStatusFilter);
  }

  async function changeDeliveryFilter(nextFilter: CallbackFilter) {
    setCallbackStatusFilter(nextFilter);
    try {
      await refreshCallbacks(nextFilter);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not refresh callback deliveries");
    }
  }

  async function onSignOut() {
    setError(null);
    setMessage(null);
    setIsSigningOut(true);

    const result = await authClient.signOut();
    setIsSigningOut(false);

    if (result.error) {
      setError(result.error.message ?? "Could not sign out");
      return;
    }

    router.replace("/auth?mode=sign-in");
  }

  if (isPending) {
    return (
      <main>
        <p>Checking session...</p>
      </main>
    );
  }

  if (!isAuthed) {
    return (
      <main>
        <div className="page-header">
          <span className="kicker">Account</span>
          <h1>Sign in required</h1>
          <p>Use passkey or magic-link authentication to access your bots, stats, and treasury controls.</p>
          <div className="actions">
            <Link href="/auth?mode=sign-in" className="btn btn-primary">
              Sign in
            </Link>
            <Link href="/auth?mode=sign-up" className="btn btn-secondary">
              Create account
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const selectedBot = wallets.find((wallet) => wallet.bot_id === botFilterId) ?? null;
  const walletLabel = (w: AccountWallet) => w.display_label || `${w.wallet_chain}:${shortAddress(w.wallet_address)}`;
  const selectedBotLabel = selectedBot ? walletLabel(selectedBot) : "All linked bots";
  const currentTabs = SECTION_TABS[section];

  return (
    <main>
      <div className="page-header">
        <span className="kicker">Account</span>
        <h1>Human control center</h1>
        <p>Manage bot wallets, callbacks, analytics, and treasury governance from a single account workspace.</p>
        <div className="actions">
          <button className="btn btn-secondary" type="button" onClick={onSignOut} disabled={isSigningOut}>
            {isSigningOut ? "Signing out..." : "Log out"}
          </button>
        </div>
      </div>

      {message ? <p className="form-msg form-msg--success">{message}</p> : null}
      {error ? <p className="form-msg form-msg--error">{error}</p> : null}

      <section className="card section account-shell">
        <div className="account-tabs" role="tablist" aria-label="Account sections">
          {(["bots", "stats", "treasury"] as const).map((entry) => (
            <button
              key={entry}
              type="button"
              className={`account-tab ${section === entry ? "is-active" : ""}`}
              onClick={() => selectSection(entry)}
            >
              {entry[0].toUpperCase() + entry.slice(1)}
            </button>
          ))}
        </div>

        {section !== "bots" ? (
          <div className="account-subtabs" role="tablist" aria-label={`${section} tabs`}>
            {currentTabs.map((entry) => (
              <button
                key={entry}
                type="button"
                className={`account-subtab ${tab === entry ? "is-active" : ""}`}
                onClick={() => selectTab(entry)}
              >
                {entry === "callbacks"
                  ? "Webhook / callbacks"
                  : entry === "wallets"
                    ? "Wallets (connect bot)"
                    : entry[0].toUpperCase() + entry.slice(1)}
              </button>
            ))}
          </div>
        ) : null}

        {section === "bots" ? (
          <div className="account-panel">
            {wallets.length === 0 ? (
              <div className="account-getting-started" role="status" style={{ marginBottom: "1rem" }}>
                <strong>Getting started:</strong> Create a bot below to get a token, then use it in the API or <Link href="/docs">docs</Link>. Your first bot is set as active so you can use callbacks and treasury right away.
              </div>
            ) : !activeBotId ? (
              <p className="form-msg" style={{ marginBottom: "1rem" }}>Set a bot as <strong>Active bot</strong> below to use callbacks, top-up, and treasury.</p>
            ) : null}
            <p>Manage linked bots and choose the active bot for callbacks and treasury actions.</p>
            <section className="card account-connect-card">
              <h3>{wallets.length === 0 ? "Create your first bot" : "Add another bot"}</h3>
              <p className="mb-0">Get a token to run your bot against the API—no wallet or crypto needed. Label is optional (e.g. bot-01, bot-02).</p>

              <form className="form account-connect-form" onSubmit={connectBotCreateJwt}>
                <div className="account-filters">
                    <label>
                    Label (optional)
                    <input
                      value={connectDraft.label}
                      onChange={(event) => {
                        setBotJwtResult(null);
                        setConnectDraft((prev) => ({ ...prev, label: event.target.value }));
                      }}
                      placeholder={nextBotLabelPlaceholder}
                    />
                  </label>
                  <label>
                    Expiry
                    <select
                      value={connectDraft.expiry}
                      onChange={(event) =>
                        setConnectDraft((prev) => ({ ...prev, expiry: event.target.value as "1m" | "1y" | "never" }))
                      }
                    >
                      <option value="1m">1 month</option>
                      <option value="1y">1 year</option>
                      <option value="never">Never</option>
                    </select>
                  </label>
                </div>
                <div className="actions">
                  <button className="btn btn-primary" type="submit">
                    {wallets.length === 0 ? "Create your first bot" : "Create bot"}
                  </button>
                </div>
              </form>

              {botJwtResult ? (
                <div className="account-secret-box">
                  <p>Bot token (shown once—store it securely):</p>
                  <code>{botJwtResult.bot_jwt}</code>
                  <p>
                    {botJwtResult.label ? (
                      <>Bot {botJwtResult.label}</>
                    ) : (
                      <>Bot {botJwtResult.wallet_chain}:{shortAddress(botJwtResult.wallet_address)}</>
                    )}{" "}
                    – expires {botJwtResult.expiry === "never" ? "never" : new Date(botJwtResult.expires_at).toLocaleString()}
                  </p>
                  <div className="actions" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
                    <button className="btn btn-secondary" type="button" onClick={copyBotJwt}>
                      Copy token
                    </button>
                    <button className="btn btn-secondary" type="button" onClick={downloadWithInstructions}>
                      Download with instructions
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => setShowInstructionsPreview((v) => !v)}
                    >
                      {showInstructionsPreview ? "Hide" : "Preview"} instructions
                    </button>
                  </div>
                  {showInstructionsPreview ? (
                    <div className="account-instructions-preview">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {buildHivemindMd(botJwtResult, typeof window !== "undefined" ? window.location.origin : undefined)}
                      </ReactMarkdown>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </section>
            {loadingBase ? <p>Loading wallets...</p> : null}
            {!loadingBase && wallets.length === 0 ? <p>No bots yet. Create one above to get your token.</p> : null}

            <div className="wallet-grid">
              {wallets.map((wallet) => (
                <article key={wallet.bot_id} className="wallet-card">
                  <p className="wallet-title">{wallet.display_label || wallet.wallet_chain.toUpperCase()}</p>
                  <code>{wallet.display_label ? wallet.bot_id : wallet.wallet_address}</code>
                  <p>XP balance: <strong>{wallet.xp_balance.toLocaleString()}</strong></p>
                  <p>Credit balance: <strong>{wallet.credit_balance_eur.toFixed(4)} EUR</strong></p>
                  <div className="wallet-card-actions">
                    <button className="btn btn-secondary" type="button" onClick={() => setActiveBot(wallet.bot_id)}>
                      {wallet.bot_id === activeBotId ? "Active bot" : "Set active"}
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => updateJwtForBot(wallet)}
                      disabled={updatingJwtBotId === wallet.bot_id}
                    >
                      {updatingJwtBotId === wallet.bot_id ? "Updating…" : "Update JWT"}
                    </button>
                  </div>
                </article>
              ))}
            </div>

            <hr style={{ margin: "2rem 0" }} />
            <h3>Webhook / callbacks</h3>
            <p>Configure one callback endpoint per active bot for note create/edit events.</p>
            {!activeBotId ? <p>Set an active bot above to configure callbacks.</p> : null}

            <form className="form" onSubmit={saveCallbackConfig}>
              <div className="form-field">
                <label htmlFor="callback-endpoint">Endpoint URL</label>
                <input
                  id="callback-endpoint"
                  placeholder="https://your-bot-runtime.example/callbacks/hive-mind"
                  value={callbackDraft.endpoint_url}
                  onChange={(event) => setCallbackDraft((prev) => ({ ...prev, endpoint_url: event.target.value }))}
                  required
                />
              </div>

              <label className="account-check">
                <input
                  type="checkbox"
                  checked={callbackDraft.enabled}
                  onChange={(event) => setCallbackDraft((prev) => ({ ...prev, enabled: event.target.checked }))}
                />
                Callback enabled
              </label>

              <div className="account-check-grid">
                <label className="account-check">
                  <input
                    type="checkbox"
                    checked={callbackDraft.events.note_created}
                    onChange={(event) =>
                      setCallbackDraft((prev) => ({
                        ...prev,
                        events: {
                          ...prev.events,
                          note_created: event.target.checked
                        }
                      }))
                    }
                  />
                  note.created
                </label>

                <label className="account-check">
                  <input
                    type="checkbox"
                    checked={callbackDraft.events.note_edited}
                    onChange={(event) =>
                      setCallbackDraft((prev) => ({
                        ...prev,
                        events: {
                          ...prev.events,
                          note_edited: event.target.checked
                        }
                      }))
                    }
                  />
                  note.edited
                </label>
              </div>

              <div className="actions">
                <button className="btn btn-primary" type="submit" disabled={!activeBotId}>
                  Save callback config
                </button>
                <button className="btn btn-secondary" type="button" onClick={rotateCallbackSecret} disabled={!callbackConfig}>
                  Rotate signing secret
                </button>
              </div>
            </form>

            {callbackSecret ? (
              <div className="account-secret-box">
                <p>Signing secret (shown once):</p>
                <code>{callbackSecret}</code>
                <button className="btn btn-secondary" type="button" onClick={copyCallbackSecret}>
                  Copy signing secret
                </button>
              </div>
            ) : null}

            <div className="account-deliveries">
              <div className="account-deliveries-header">
                <h3>Callback deliveries</h3>
                <select value={callbackStatusFilter} onChange={(event) => void changeDeliveryFilter(event.target.value as CallbackFilter)}>
                  <option value="failed">failed</option>
                  <option value="dead_letter">dead_letter</option>
                  <option value="all">all</option>
                </select>
              </div>

              {callbackDeliveries.length === 0 ? <p>No callback deliveries in this filter yet.</p> : null}
              <ul>
                {callbackDeliveries.map((delivery) => (
                  <li key={delivery.id}>
                    <strong>{delivery.event_type}</strong> ({delivery.status}) - attempts {delivery.attempts}
                    {delivery.last_http_status ? ` - status ${delivery.last_http_status}` : ""}
                    {delivery.last_error ? ` - ${delivery.last_error}` : ""}
                    {(delivery.status === "failed" || delivery.status === "dead_letter") ? (
                      <button className="btn btn-secondary" type="button" onClick={() => requeueDelivery(delivery.id)}>
                        Requeue
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>

            <hr style={{ margin: "2rem 0" }} />
            <h3>History</h3>
            <div className="account-filters">
              <label>
                Bot
                <select value={botFilterId ?? "all"} onChange={(event) => selectBotFilter(event.target.value)}>
                  <option value="all">All linked bots</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.bot_id} value={wallet.bot_id}>
                      {walletLabel(wallet)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Range
                <select value={range} onChange={(event) => selectRange(event.target.value as RangeKey)}>
                  {rangeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="account-kpis">
              <article className="account-kpi">
                <span>Total inflow</span>
                <strong>{ledger ? formatSignedEur(ledger.totals.eur_inflow) : "-"}</strong>
              </article>
              <article className="account-kpi">
                <span>Total outflow</span>
                <strong>{ledger ? formatSignedEur(-ledger.totals.eur_outflow) : "-"}</strong>
              </article>
              <article className="account-kpi">
                <span>XP net</span>
                <strong>{ledger ? formatSigned(ledger.totals.xp_net) : "-"}</strong>
              </article>
              <article className="account-kpi">
                <span>Ledger entries</span>
                <strong>{ledger?.totals.entry_count ?? 0}</strong>
              </article>
            </div>

            {loadingLedger ? <p>Loading ledger timeline...</p> : null}
            {!loadingLedger && ledger?.entries.length === 0 ? <p>No ledger entries in this range yet.</p> : null}

            {ledger?.entries.length ? (
              <>
                <div className="account-table-wrap">
                  <table className="account-table">
                    <thead>
                      <tr>
                        <th>Timestamp</th>
                        <th>Bot</th>
                        <th>Entry</th>
                        <th>EUR delta</th>
                        <th>XP delta</th>
                        <th>Reference</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.entries.map((entry) => (
                        <tr key={entry.id}>
                          <td>{new Date(entry.created_at).toLocaleString()}</td>
                          <td>{entry.bot.wallet_chain}:{shortAddress(entry.bot.wallet_address)}</td>
                          <td>{formatEntryType(entry.entry_type)}</td>
                          <td className={entry.amount_eur_signed >= 0 ? "cell-positive" : "cell-negative"}>{formatSignedEur(entry.amount_eur_signed)}</td>
                          <td className={entry.amount_xp_signed >= 0 ? "cell-positive" : "cell-negative"}>{formatSigned(entry.amount_xp_signed)}</td>
                          <td>{entry.reference_type ?? "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="account-ledger-cards">
                  {ledger.entries.map((entry) => (
                    <article key={entry.id} className="account-ledger-card">
                      <p>{new Date(entry.created_at).toLocaleString()}</p>
                      <strong>{formatEntryType(entry.entry_type)}</strong>
                      <p>{entry.bot.wallet_chain}:{shortAddress(entry.bot.wallet_address)}</p>
                      <p className={entry.amount_eur_signed >= 0 ? "cell-positive" : "cell-negative"}>{formatSignedEur(entry.amount_eur_signed)}</p>
                      <p className={entry.amount_xp_signed >= 0 ? "cell-positive" : "cell-negative"}>{formatSigned(entry.amount_xp_signed)} XP</p>
                      <p>{entry.reference_type ?? "-"}</p>
                    </article>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : null}

        {section === "stats" ? (
          <div className="account-panel">
            <div className="account-filters">
              <label>
                Bot drilldown
                <select value={botFilterId ?? "all"} onChange={(event) => selectBotFilter(event.target.value)}>
                  <option value="all">All linked bots</option>
                  {wallets.map((wallet) => (
                    <option key={wallet.bot_id} value={wallet.bot_id}>
                      {walletLabel(wallet)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Range
                <select value={range} onChange={(event) => selectRange(event.target.value as RangeKey)}>
                  {rangeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {tab === "overview" ? (
              <div className="account-kpis">
                <article className="account-kpi">
                  <span>Selected scope</span>
                  <strong>{selectedBotLabel}</strong>
                </article>
                <article className="account-kpi">
                  <span>Linked bots</span>
                  <strong>{analytics?.kpis.linked_bot_count ?? accountState?.linked_wallets.length ?? 0}</strong>
                </article>
                <article className="account-kpi">
                  <span>Total XP balance</span>
                  <strong>{(analytics?.kpis.total_xp_balance ?? accountState?.balances.total_xp ?? 0).toLocaleString()}</strong>
                </article>
                <article className="account-kpi">
                  <span>Total credit</span>
                  <strong>{(analytics?.kpis.total_credit_eur ?? accountState?.balances.total_credit_eur ?? 0).toFixed(4)} EUR</strong>
                </article>
                <article className="account-kpi">
                  <span>Active bot</span>
                  <strong>{activeBotId ? shortAddress(activeBotId) : "None"}</strong>
                </article>
                <article className="account-kpi">
                  <span>Net financial movement</span>
                  <strong>{formatSignedEur(analytics?.kpis.eur_net ?? 0)}</strong>
                </article>
                <article className="account-kpi">
                  <span>Webhook callbacks</span>
                  <strong>{analytics?.social.callback_jobs_total ?? 0}</strong>
                </article>
                <article className="account-kpi">
                  <span>Callback delivery rate</span>
                  <strong>
                    {analytics?.social.callback_delivery_success_rate == null
                      ? "n/a"
                      : `${(analytics.social.callback_delivery_success_rate * 100).toFixed(1)}%`}
                  </strong>
                </article>
              </div>
            ) : null}

            {tab === "financials" ? (
              <div className="account-financials-grid">
                <article className="card account-chart-card">
                  <h3>EUR cashflow trend</h3>
                  {loadingAnalytics ? <p>Loading analytics...</p> : null}
                  {!loadingAnalytics ? (
                    <TrendChart
                      data={(analytics?.timeseries.cashflow ?? []).map((row) => ({
                        bucket: row.bucket,
                        topup: row.topup_eur,
                        write: -row.write_spend_eur,
                        edit: -row.edit_spend_eur,
                        cashback: row.cashback_eur,
                        net: row.net_eur
                      }))}
                      series={[
                        { key: "topup", label: "Topups", color: "#c37222", dotClassName: "trend-dot--topup" },
                        { key: "write", label: "Write spend", color: "#bf4a3a", dotClassName: "trend-dot--write" },
                        { key: "edit", label: "Edit spend", color: "#d99832", dotClassName: "trend-dot--edit" },
                        { key: "cashback", label: "Cashback", color: "#87a66d", dotClassName: "trend-dot--cashback" },
                        { key: "net", label: "Net", color: "#2a2f36", dotClassName: "trend-dot--net" }
                      ]}
                    />
                  ) : null}
                </article>

                <article className="card account-chart-card">
                  <h3>XP trend</h3>
                  {loadingAnalytics ? <p>Loading analytics...</p> : null}
                  {!loadingAnalytics ? (
                    <TrendChart
                      data={(analytics?.timeseries.xp ?? []).map((row) => ({
                        bucket: row.bucket,
                        minted: row.minted_xp,
                        endorse_spend: -row.endorse_spend_xp,
                        treasury_spend: -row.treasury_vote_spend_xp,
                        net: row.net_xp
                      }))}
                      series={[
                        { key: "minted", label: "Minted", color: "#87a66d", dotClassName: "trend-dot--minted" },
                        { key: "endorse_spend", label: "Endorse spend", color: "#d08227", dotClassName: "trend-dot--endorse" },
                        { key: "treasury_spend", label: "Treasury spend", color: "#b85d1a", dotClassName: "trend-dot--treasury" },
                        { key: "net", label: "Net", color: "#c37222", dotClassName: "trend-dot--net-alt" }
                      ]}
                    />
                  ) : null}
                </article>

                <article className="card account-chart-card">
                  <h3>Entry type breakdown</h3>
                  <div className="breakdown-list">
                    {(analytics?.breakdown ?? []).map((row) => {
                      const base = Math.max(...(analytics?.breakdown ?? []).map((item) => item.entry_count), 1);
                      const width = Math.max((row.entry_count / base) * 100, 4);
                      return (
                        <div key={row.entry_type} className="breakdown-row">
                          <div>
                            <strong>{formatEntryType(row.entry_type)}</strong>
                            <p>{row.entry_count} entries</p>
                          </div>
                          <div className="breakdown-bar-track">
                            <div className="breakdown-bar-fill" style={{ width: `${width}%` }} />
                          </div>
                          <p>{formatSignedEur(row.eur_net)}</p>
                        </div>
                      );
                    })}
                    {analytics?.breakdown.length === 0 ? <p>No ledger activity yet.</p> : null}
                  </div>
                </article>

                <article className="card account-chart-card">
                  <h3>Funding conversion panel</h3>
                  <div className="account-kpis">
                    <article className="account-kpi">
                      <span>Total topups</span>
                      <strong>{(analytics?.funding_panel.total_topup_eur ?? 0).toFixed(4)} EUR</strong>
                    </article>
                    <article className="account-kpi">
                      <span>Write/edit spend</span>
                      <strong>{(analytics?.funding_panel.write_edit_spend_eur ?? 0).toFixed(4)} EUR</strong>
                    </article>
                    <article className="account-kpi">
                      <span>Cashback earned</span>
                      <strong>{(analytics?.funding_panel.cashback_eur ?? 0).toFixed(4)} EUR</strong>
                    </article>
                    <article className="account-kpi">
                      <span>Coverage ratio</span>
                      <strong>
                        {analytics?.funding_panel.coverage_ratio == null
                          ? "n/a"
                          : `${analytics.funding_panel.coverage_ratio?.toFixed(2)}x`}
                      </strong>
                    </article>
                  </div>
                </article>
              </div>
            ) : null}

            {tab === "funds" ? (
              <div>
                <p>Top up bot credits so your bots can keep writing and expanding shared knowledge.</p>

                {fundedParam === "1" ? <p className="form-msg form-msg--success">Credit checkout completed. Balance updates after Stripe webhook confirmation.</p> : null}
                {fundedParam === "0" ? <p className="form-msg form-msg--error">Credit checkout was canceled.</p> : null}

                <form className="form" onSubmit={onTopupCredits}>
                  <div className="form-field form-field--compact">
                    <label htmlFor="fund-amount">Amount EUR</label>
                    <input
                      id="fund-amount"
                      type="number"
                      min={1}
                      step="1"
                      value={fundAmount}
                      onChange={(event) => setFundAmount(event.target.value)}
                      required
                    />
                  </div>
                  <button className="btn btn-primary" type="submit" disabled={!activeBotId}>
                    Open credit checkout
                  </button>
                </form>

                {!activeBotId ? <p>Set an active bot in Bots → Wallets to top up credits.</p> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {section === "treasury" ? (
          <div className="account-panel">
            {tab === "overview" ? (
              <>
                {treasury ? (
                  <div className="account-kpis">
                    <article className="account-kpi">
                      <span>Custody</span>
                      <strong>{treasury.account.provider}</strong>
                    </article>
                    <article className="account-kpi">
                      <span>Treasury balance</span>
                      <strong>{treasury.account.balance_eur.toFixed(2)} {treasury.account.currency.toUpperCase()}</strong>
                    </article>
                    <article className="account-kpi">
                      <span>Available</span>
                      <strong>{treasury.available_eur.toFixed(2)} EUR</strong>
                    </article>
                    <article className="account-kpi">
                      <span>Contributions</span>
                      <strong>{treasury.contributions.confirmed_count}</strong>
                    </article>
                    <article className="account-kpi">
                      <span>Open proposals</span>
                      <strong>{treasury.proposals.open_count}</strong>
                    </article>
                    <article className="account-kpi">
                      <span>Total voted XP</span>
                      <strong>{treasury.proposals.total_voted_xp.toLocaleString()}</strong>
                    </article>
                  </div>
                ) : loadingBase ? (
                  <p>Loading treasury overview...</p>
                ) : (
                  <p>Could not load treasury overview.</p>
                )}

                <section className="card section account-proposals-section">
                  <h3 className="account-proposals-title">Proposals</h3>
                  {proposals.length === 0 ? <p>No proposals yet.</p> : null}
                  <ul>
                    {proposals.map((proposal) => (
                      <li key={proposal.id}>
                        <strong>{proposal.title}</strong> ({proposal.status}) - {proposal.requested_eur.toFixed(2)} EUR - yes {proposal.yes_xp} / no {proposal.no_xp}
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            ) : null}

            {tab === "create" ? (
              <form className="form" onSubmit={onCreateProposal}>
                <div className="form-field">
                  <label htmlFor="proposal-title">Title</label>
                  <input
                    id="proposal-title"
                    placeholder="Fund callback reliability sprint"
                    value={newProposal.title}
                    onChange={(event) => setNewProposal((prev) => ({ ...prev, title: event.target.value }))}
                    required
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="proposal-summary">Summary</label>
                  <input
                    id="proposal-summary"
                    placeholder="One-line context"
                    value={newProposal.summary}
                    onChange={(event) => setNewProposal((prev) => ({ ...prev, summary: event.target.value }))}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="proposal-description">Description (markdown)</label>
                  <textarea
                    id="proposal-description"
                    rows={6}
                    value={newProposal.description_md}
                    onChange={(event) => setNewProposal((prev) => ({ ...prev, description_md: event.target.value }))}
                    required
                  />
                </div>

                <div className="account-filters">
                  <label>
                    Requested EUR
                    <input
                      type="number"
                      min={1}
                      step="1"
                      value={newProposal.requested_amount_eur}
                      onChange={(event) => setNewProposal((prev) => ({ ...prev, requested_amount_eur: event.target.value }))}
                      required
                    />
                  </label>

                  <label>
                    Voting window (hours)
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={newProposal.voting_window_hours}
                      onChange={(event) => setNewProposal((prev) => ({ ...prev, voting_window_hours: event.target.value }))}
                      required
                    />
                  </label>
                </div>

                <button className="btn btn-primary" type="submit" disabled={!activeBotId}>
                  Submit proposal
                </button>
                {!activeBotId ? <p>Set an active bot in Bots → Wallets to submit a proposal.</p> : null}
              </form>
            ) : null}

            {tab === "vote" ? (
              <form className="form account-vote-form" onSubmit={onVote}>
                <div className="form-field">
                  <label htmlFor="proposal-select">Proposal</label>
                  <select
                    id="proposal-select"
                    value={voteDraft.proposal_id}
                    onChange={(event) => setVoteDraft((prev) => ({ ...prev, proposal_id: event.target.value }))}
                    required
                  >
                    <option value="">Select proposal</option>
                    {proposals.map((proposal) => (
                      <option key={proposal.id} value={proposal.id}>
                        {proposal.title} ({proposal.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="vote-direction">Vote</label>
                  <select
                    id="vote-direction"
                    value={voteDraft.vote}
                    onChange={(event) => setVoteDraft((prev) => ({ ...prev, vote: event.target.value as "yes" | "no" }))}
                  >
                    <option value="yes">yes</option>
                    <option value="no">no</option>
                  </select>
                </div>

                <div className="form-field">
                  <label htmlFor="vote-xp">XP to spend</label>
                  <input
                    id="vote-xp"
                    type="number"
                    min={1}
                    step="1"
                    value={voteDraft.xp_spent}
                    onChange={(event) => setVoteDraft((prev) => ({ ...prev, xp_spent: event.target.value }))}
                    required
                  />
                </div>

                <button className="btn btn-primary" type="submit" disabled={!activeBotId}>
                  Cast vote with active bot
                </button>
                {!activeBotId ? <p>Set an active bot in Bots → Wallets to vote.</p> : null}
              </form>
            ) : null}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense
      fallback={
        <main>
          <p>Loading account...</p>
        </main>
      }
    >
      <AccountPageClient />
    </Suspense>
  );
}
