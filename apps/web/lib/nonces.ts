import type { PoolClient } from "pg";

export interface NonceInsert {
  nonce: string;
  walletAddress: string;
  chain: "evm" | "cardano" | "bitcoin";
  actionType:
    | "auth_login"
    | "create_note"
    | "edit_note"
    | "endorse_note"
    | "create_treasury_proposal"
    | "vote_treasury_proposal"
    | "link_wallet";
  botId?: string;
  expiresAt: string;
}

export async function insertNonce(client: PoolClient, input: NonceInsert): Promise<{ id: string }> {
  const result = await client.query<{ id: string }>(
    `insert into action_nonces (nonce, wallet_address, chain, action_type, bot_id, expires_at)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [
      input.nonce,
      input.walletAddress,
      input.chain,
      input.actionType,
      input.botId ?? null,
      input.expiresAt
    ]
  );

  return result.rows[0];
}

export async function lockActiveNonce(
  client: PoolClient,
  input: Pick<NonceInsert, "nonce" | "walletAddress" | "chain" | "actionType"> & { botId?: string }
): Promise<{ id: string; expires_at: string; used_at: string | null } | null> {
  const result = await client.query<{ id: string; expires_at: string; used_at: string | null }>(
    `select id, expires_at::text, used_at::text
     from action_nonces
     where nonce = $1
       and wallet_address = $2
       and chain = $3
       and action_type = $4
       and ($5::uuid is null or bot_id = $5)
     for update`,
    [input.nonce, input.walletAddress, input.chain, input.actionType, input.botId ?? null]
  );

  if (!result.rowCount) {
    return null;
  }

  return result.rows[0];
}

export async function markNonceUsed(client: PoolClient, nonceId: string): Promise<void> {
  await client.query(`update action_nonces set used_at = now() where id = $1`, [nonceId]);
}
