import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { getEnv } from "./env";

const BOT_JWT_SCOPE = "bot_runtime";
const BOT_JWT_AUDIENCE = "hive-mind-api";

const claimsSchema = z.object({
  sub: z.string().uuid(),
  bot_id: z.string().uuid(),
  account_id: z.string().min(1),
  account_email: z.string().email(),
  account_name: z.string().min(1),
  wallet_chain: z.enum(["evm", "cardano", "bitcoin"]),
  wallet_address: z.string().min(4),
  scope: z.literal(BOT_JWT_SCOPE)
});

export type VerifiedBotJwtClaims = z.infer<typeof claimsSchema>;

export interface IssueBotJwtInput {
  botId: string;
  accountId: string;
  accountEmail: string;
  accountName: string;
  walletChain: "evm" | "cardano" | "bitcoin";
  walletAddress: string;
  expiresInHours: number;
}

export interface IssuedBotJwt {
  token: string;
  expiresAt: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getEnv().APP_JWT_SECRET);
}

function issuer(): string {
  return `https://${getEnv().APP_DOMAIN}`;
}

export async function issueBotJwt(input: IssueBotJwtInput): Promise<IssuedBotJwt> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.expiresInHours * 60 * 60 * 1000);

  const token = await new SignJWT({
    bot_id: input.botId,
    account_id: input.accountId,
    account_email: input.accountEmail,
    account_name: input.accountName,
    wallet_chain: input.walletChain,
    wallet_address: input.walletAddress,
    scope: BOT_JWT_SCOPE
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(issuer())
    .setAudience(BOT_JWT_AUDIENCE)
    .setSubject(input.botId)
    .setIssuedAt(Math.floor(now.getTime() / 1000))
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .setJti(randomUUID())
    .sign(secretKey());

  return {
    token,
    expiresAt: expiresAt.toISOString()
  };
}

export async function verifyBotJwt(token: string): Promise<VerifiedBotJwtClaims> {
  const { payload } = await jwtVerify(token, secretKey(), {
    issuer: issuer(),
    audience: BOT_JWT_AUDIENCE
  });

  return claimsSchema.parse(payload);
}
