import { z } from "zod";
import { buildCanonicalPayload, computeTreasuryOutcome, sha256Hex, signatureEnvelopeSchema } from "@hive-mind/shared";
import { verifyAndPersistActionSignature } from "@/lib/actions";
import { query, withTransaction } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { assertTrustedMutationOrigin, errorResponse, jsonResponse, parseJson } from "@/lib/http";
import { requireAccountSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const createProposalSchema = z.object({
  title: z.string().min(5).max(180),
  summary: z.string().max(300).optional(),
  description_md: z.string().min(20).max(24_000),
  requested_amount_eur: z.number().positive().max(500_000),
  voting_window_hours: z.number().int().positive().max(720).optional(),
  source_bot_id: z.string().uuid().optional(),
  signature: signatureEnvelopeSchema.optional()
});

export async function GET(): Promise<Response> {
  try {
    const rows = await query<{
      id: string;
      title: string;
      summary: string | null;
      requested_micro_eur: string;
      status: "open" | "approved" | "rejected" | "funded" | "cancelled";
      vote_quorum_xp: string;
      yes_xp: string;
      no_xp: string;
      voting_deadline: string;
      created_at: string;
      updated_at: string;
      proposer_account_id: string | null;
      proposer_email: string | null;
      proposer_name: string | null;
      proposer_wallet_chain: "evm" | "cardano" | "bitcoin" | null;
      proposer_wallet_address: string | null;
    }>(
      `select tp.id,
              tp.title,
              tp.summary,
              tp.requested_micro_eur::text,
              tp.status,
              tp.vote_quorum_xp::text,
              tp.yes_xp::text,
              tp.no_xp::text,
              tp.voting_deadline::text,
              tp.created_at::text,
              tp.updated_at::text,
              tp.proposer_account_id,
              u.email as proposer_email,
              u.name as proposer_name,
              b.wallet_chain as proposer_wallet_chain,
              b.wallet_address as proposer_wallet_address
       from treasury_proposals tp
       left join "user" u on u.id = tp.proposer_account_id
       left join bots b on b.id = tp.proposer_bot_id
       order by tp.created_at desc
       limit 200`
    );

    const now = Date.now();

    return jsonResponse({
      ok: true,
      proposals: rows.rows.map((row) => {
        const yesXp = Number(row.yes_xp);
        const noXp = Number(row.no_xp);
        const quorumXp = Number(row.vote_quorum_xp);
        const outcome = computeTreasuryOutcome({ yesXp, noXp, quorumXp });
        const votingDeadlineTs = Date.parse(row.voting_deadline);
        const votingOpen = Number.isFinite(votingDeadlineTs) && votingDeadlineTs > now && row.status === "open";

        return {
          id: row.id,
          title: row.title,
          summary: row.summary,
          requested_micro_eur: Number(row.requested_micro_eur),
          requested_eur: Number(row.requested_micro_eur) / 1_000_000,
          status: row.status,
          voting_deadline: row.voting_deadline,
          voting_open: votingOpen,
          vote_quorum_xp: quorumXp,
          yes_xp: yesXp,
          no_xp: noXp,
          total_voted_xp: outcome.totalXp,
          quorum_reached: outcome.quorumReached,
          passing: outcome.approved,
          proposer: {
            account_id: row.proposer_account_id,
            email: row.proposer_email,
            name: row.proposer_name,
            wallet_chain: row.proposer_wallet_chain,
            wallet_address: row.proposer_wallet_address
          },
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      })
    });
  } catch {
    return errorResponse("Could not fetch treasury proposals", 500);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    assertTrustedMutationOrigin(request);
    const accountSession = await requireAccountSession(request);
    const body = await parseJson(request, createProposalSchema);
    const env = getEnv();

    if (body.signature && !body.source_bot_id) {
      return errorResponse("source_bot_id is required when signature proof is provided", 400);
    }

    const votingWindowHours = body.voting_window_hours ?? env.TREASURY_DEFAULT_VOTING_WINDOW_HOURS;
    const voteQuorumXp = env.TREASURY_VOTE_QUORUM_XP;
    const requestedMicroEur = Math.round(body.requested_amount_eur * 1_000_000);

    const result = await withTransaction(async (client) => {
      const treasuryAccount = await client.query<{ id: string }>(
        `select id
         from treasury_accounts
         where status = 'active'
         order by updated_at desc
         limit 1
         for update`
      );

      if (!treasuryAccount.rowCount) {
        throw new Error("No active treasury account configured");
      }

      let sourceBot: {
        bot_id: string;
        wallet_chain: "evm" | "cardano" | "bitcoin";
        wallet_address: string;
      } | null = null;

      if (body.source_bot_id) {
        const sourceBotResult = await client.query<{
          bot_id: string;
          wallet_chain: "evm" | "cardano" | "bitcoin";
          wallet_address: string;
        }>(
          `select awl.bot_id,
                  b.wallet_chain,
                  b.wallet_address
           from account_wallet_links awl
           join bots b on b.id = awl.bot_id
           where awl.account_id = $1
             and awl.bot_id = $2
           limit 1
           for update`,
          [accountSession.accountId, body.source_bot_id]
        );

        if (!sourceBotResult.rowCount) {
          throw new Error("source_bot_id is not linked to this account");
        }

        sourceBot = sourceBotResult.rows[0];
      }

      let actionSignatureId: string | null = null;
      if (body.signature) {
        if (!sourceBot) {
          throw new Error("source_bot_id is required when signature proof is provided");
        }

        const contentDigestInput = JSON.stringify({
          title: body.title,
          summary: body.summary ?? null,
          description_md: body.description_md,
          requested_micro_eur: requestedMicroEur,
          voting_window_hours: votingWindowHours
        });

        const payload = buildCanonicalPayload({
          action_type: "create_treasury_proposal",
          bot_id: sourceBot.bot_id,
          chain: sourceBot.wallet_chain,
          wallet_address: sourceBot.wallet_address,
          note_id: null,
          proposal_id: null,
          content_sha256: sha256Hex(contentDigestInput),
          changed_chars: body.description_md.length,
          endorse_xp: null,
          vote_xp: null,
          nonce: body.signature.nonce,
          issued_at: body.signature.issued_at,
          expires_at: body.signature.expires_at
        });

        const signature = await verifyAndPersistActionSignature({
          client,
          botId: sourceBot.bot_id,
          actionType: "create_treasury_proposal",
          payload,
          envelope: body.signature
        });

        actionSignatureId = signature.actionSignatureId;
      }

      const votingDeadline = new Date(Date.now() + votingWindowHours * 60 * 60 * 1000).toISOString();

      const inserted = await client.query<{
        id: string;
        proposer_account_id: string | null;
        proposer_bot_id: string | null;
        title: string;
        summary: string | null;
        description_md: string;
        requested_micro_eur: string;
        status: string;
        vote_quorum_xp: string;
        yes_xp: string;
        no_xp: string;
        voting_deadline: string;
        created_at: string;
      }>(
        `insert into treasury_proposals (
          proposer_bot_id,
          proposer_account_id,
          title,
          summary,
          description_md,
          requested_micro_eur,
          status,
          vote_quorum_xp,
          voting_deadline,
          treasury_account_id,
          action_signature_id
        )
        values ($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,$10)
        returning id,
                  proposer_account_id,
                  proposer_bot_id,
                  title,
                  summary,
                  description_md,
                  requested_micro_eur::text,
                  status,
                  vote_quorum_xp::text,
                  yes_xp::text,
                  no_xp::text,
                  voting_deadline::text,
                  created_at::text`,
        [
          sourceBot?.bot_id ?? null,
          accountSession.accountId,
          body.title,
          body.summary ?? null,
          body.description_md,
          requestedMicroEur,
          voteQuorumXp,
          votingDeadline,
          treasuryAccount.rows[0].id,
          actionSignatureId
        ]
      );

      return inserted.rows[0];
    });

    return jsonResponse({
      ok: true,
      proposal: {
        id: result.id,
        proposer_account_id: result.proposer_account_id,
        proposer_bot_id: result.proposer_bot_id,
        title: result.title,
        summary: result.summary,
        description_md: result.description_md,
        requested_micro_eur: Number(result.requested_micro_eur),
        requested_eur: Number(result.requested_micro_eur) / 1_000_000,
        status: result.status,
        vote_quorum_xp: Number(result.vote_quorum_xp),
        yes_xp: Number(result.yes_xp),
        no_xp: Number(result.no_xp),
        voting_deadline: result.voting_deadline,
        created_at: result.created_at
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return errorResponse("Invalid treasury proposal payload", 400, error.flatten());
    }
    return errorResponse(error instanceof Error ? error.message : "Could not create treasury proposal", 400);
  }
}
