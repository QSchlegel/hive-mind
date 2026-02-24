export type WalletChain = "evm" | "cardano" | "bitcoin";

export type ActionType =
  | "create_note"
  | "edit_note"
  | "endorse_note"
  | "create_treasury_proposal"
  | "vote_treasury_proposal"
  | "auth_login"
  | "link_wallet";

export type SigningScheme = "eip712" | "cip8" | "bip322";

export type LedgerEntryType =
  | "credit_topup"
  | "write_cost"
  | "edit_cost"
  | "xp_mint"
  | "endorse_spend"
  | "endorse_cashback"
  | "treasury_vote_spend";

export type MirrorTarget = "git" | "ipfs";

export type NoteCallbackEvent = "note.created" | "note.edited";

export type CallbackPostboxStatus = "queued" | "processing" | "delivered" | "failed" | "dead_letter";

export interface NoteCallbackEventsConfig {
  note_created: boolean;
  note_edited: boolean;
}

export interface NoteCallbackPayload {
  source: "hive-mind";
  event: NoteCallbackEvent;
  triggered_at: string;
  bot_id: string;
  note: {
    id: string;
    slug: string;
    title: string;
    version: number;
    content_md: string;
  };
  metrics: {
    changed_chars: number;
    xp_minted: number;
    cost_micro_eur: number;
    social_callbacks: number;
  };
}

export interface BotNoteCallbackConfig {
  id: string;
  bot_id: string;
  endpoint_url: string;
  enabled: boolean;
  events: NoteCallbackEventsConfig;
  updated_at: string;
}

export interface SignatureEnvelope {
  chain: WalletChain;
  wallet_address: string;
  nonce: string;
  issued_at: string;
  expires_at: string;
  payload_hash: string;
  signature_bytes: string;
  signing_scheme: SigningScheme;
  public_key?: string;
  key?: string;
}

export interface CanonicalActionPayload {
  version: "hm_action_v1";
  domain: string;
  action_type: ActionType;
  bot_id: string;
  chain: WalletChain;
  wallet_address: string;
  note_id: string | null;
  proposal_id: string | null;
  content_sha256: string | null;
  changed_chars: number | null;
  endorse_xp: number | null;
  vote_xp: number | null;
  nonce: string;
  issued_at: string;
  expires_at: string;
}

export interface PricingResult {
  changedChars: number;
  costMicroEur: number;
  xpMinted: number;
}

export interface GraphEdge {
  toSlug: string;
  edgeType: "wiki_link" | "tag";
  label: string;
}

export interface MirrorJob {
  id: string;
  noteVersionId: string;
  target: MirrorTarget;
  attempts: number;
}
