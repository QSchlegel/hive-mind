import type { PoolClient } from "pg";

export async function lockBot(client: PoolClient, botId: string): Promise<{
  id: string;
  xp_balance: number;
  credit_balance_micro_eur: number;
  daily_endorse_xp_spent: number;
  daily_reset_at: string;
}> {
  const result = await client.query<{
    id: string;
    xp_balance: number;
    credit_balance_micro_eur: number;
    daily_endorse_xp_spent: number;
    daily_reset_at: string;
  }>(
    `select id,
            xp_balance,
            credit_balance_micro_eur,
            daily_endorse_xp_spent,
            daily_reset_at::text
     from bots where id = $1 for update`,
    [botId]
  );

  if (!result.rowCount) {
    throw new Error("Bot not found");
  }

  return result.rows[0];
}

export function resolveDailyEndorseSpent(bot: { daily_endorse_xp_spent: number; daily_reset_at: string }): number {
  const now = new Date();
  const resetAt = new Date(bot.daily_reset_at);
  const isSameDay = now.toISOString().slice(0, 10) === resetAt.toISOString().slice(0, 10);
  return isSameDay ? bot.daily_endorse_xp_spent : 0;
}
