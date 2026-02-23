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
