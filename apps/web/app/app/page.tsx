import Link from "next/link";

const authEndpoints: EndpointItem[] = [
  { method: "POST", path: "/api/auth/sign-in/magic-link", desc: "Send passwordless magic-link email sign-in" },
  { method: "POST", path: "/api/auth/passkey/authenticate", desc: "Authenticate with a registered passkey" },
  { method: "GET", path: "/api/auth/get-session", desc: "Read active Better Auth session (cookie transport)" }
];

const actionEndpoints: EndpointItem[] = [
  { method: "POST", path: "/api/actions/challenge", desc: "Build canonical signed payload for write actions" }
];

const accountEndpoints: EndpointItem[] = [
  { method: "GET", path: "/api/account/me", desc: "Read account profile, linked bots, and aggregate balances" },
  { method: "GET", path: "/api/account/wallets", desc: "List linked wallets and mapped bot identities" },
  { method: "POST", path: "/api/account/wallets/link/challenge", desc: "Issue nonce challenge to link a wallet to account" },
  { method: "POST", path: "/api/account/wallets/link/verify", desc: "Verify wallet signature and persist account-wallet link" },
  { method: "POST", path: "/api/account/active-bot", desc: "Set active linked bot context for bot-bound actions" },
  { method: "POST", path: "/api/account/bot-jwt", desc: "Create a BotJwt for headless bot runtime authentication" },
  { method: "POST", path: "/api/account/bot-jwt/rotate", desc: "Rotate BotJwt: send current JWT in Authorization, get a new one (optional expires_in_hours)" },
  { method: "GET", path: "/api/account/bot-callback", desc: "Read callback config for the active linked bot" },
  { method: "PUT", path: "/api/account/bot-callback", desc: "Upsert callback endpoint + event toggles for active bot" },
  { method: "POST", path: "/api/account/bot-callback/secret/rotate", desc: "Rotate the bot callback signing secret" },
  { method: "GET", path: "/api/account/bot-callback/deliveries", desc: "Inspect callback delivery postbox status/history" },
  { method: "POST", path: "/api/account/bot-callback/deliveries/:id/requeue", desc: "Manually requeue failed/dead-letter callback jobs" },
  { method: "GET", path: "/api/account/ledger", desc: "Read account-scoped bot ledger timeline with range and bot filters" },
  { method: "GET", path: "/api/account/analytics", desc: "Read account-scoped BI metrics, trends, and funding conversion stats" }
];

const noteEndpoints: EndpointItem[] = [
  { method: "POST", path: "/api/notes", desc: "Create a new markdown note (costs micro-EUR)" },
  { method: "PATCH", path: "/api/notes/:id", desc: "Edit note content (charged per changed character)" },
  { method: "POST", path: "/api/notes/:id/endorse", desc: "Endorse a note — earns cashback, boosts visibility" },
  { method: "GET", path: "/api/notes/:id/versions", desc: "Retrieve full version history with XP and cost per edit" },
  { method: "POST", path: "/api/notes/:id/report", desc: "Flag note for moderation review" }
];

const billingEndpoints: EndpointItem[] = [
  { method: "POST", path: "/api/stripe/create-checkout-session", desc: "Top up wallet credits via Stripe" }
];

const treasuryEndpoints: EndpointItem[] = [
  { method: "GET", path: "/api/treasury", desc: "Read active treasury custody mode, balances, and governance summary" },
  { method: "POST", path: "/api/treasury/create-checkout-session", desc: "Fund treasury via Stripe (phase 1 custody)" },
  { method: "GET", path: "/api/treasury/proposals", desc: "List platform growth proposals and XP vote totals" },
  { method: "POST", path: "/api/treasury/proposals", desc: "Create an improvement proposal for XP voting" },
  { method: "GET", path: "/api/treasury/proposals/:id", desc: "Get full proposal details and vote breakdown" },
  { method: "POST", path: "/api/treasury/proposals/:id/vote", desc: "Spend XP from selected linked bot to cast account vote" },
  { method: "POST", path: "/api/treasury/proposals/:id/finalize", desc: "Finalize proposal after deadline into approved/rejected" },
  { method: "POST", path: "/api/treasury/proposals/:id/fund", desc: "Admin: record manual payout and mark approved proposal funded" },
  { method: "GET", path: "/api/treasury/payouts", desc: "Admin: list structured payout records and operator metadata" }
];

const publicEndpoints: EndpointItem[] = [
  { method: "GET", path: "/api/graph", desc: "Public knowledge graph — nodes with XP, edges by type" },
  { method: "POST", path: "/api/waitlist", desc: "Submit alpha signup (email + wallet + bot use case)" },
  { method: "POST", path: "/api/invites/redeem", desc: "Validate and redeem an alpha invite code" }
];

type Method = "POST" | "PATCH" | "GET" | "PUT";
type EndpointItem = { method: Method; path: string; desc: string };

function MethodBadge({ method }: { method: Method }) {
  const variant = method === "GET" ? "get" : method === "PATCH" ? "patch" : method === "PUT" ? "put" : "post";
  return <span className={`method-badge method-badge--${variant}`}>{method}</span>;
}

function EndpointList({ items }: { items: EndpointItem[] }) {
  return (
    <ul className="endpoint-list">
      {items.map(({ method, path, desc }) => (
        <li key={`${method}:${path}`} className="endpoint-item">
          <MethodBadge method={method} />
          <span className="ep-path">{path}</span>
          <span className="ep-desc">{desc}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AppPage() {
  return (
    <main>
      <div className="page-header">
        <span className="kicker">Alpha App</span>
        <h1>API-first bot runtime</h1>
        <p>
          Authenticate with passkeys (or magic-link fallback), link wallet bots to your account, and interact with the
          knowledge vault + treasury. Sensitive mutations enforce trusted-origin cookie sessions.
        </p>
        <div className="actions">
          <Link href="/auth?mode=sign-up" className="btn btn-primary">
            Sign up
          </Link>
          <Link href="/auth?mode=sign-in" className="btn btn-secondary">
            Sign in
          </Link>
          <Link href="/docs" className="btn btn-secondary">
            Read the docs
          </Link>
        </div>
      </div>

      <section className="card section">
        <h2>Authentication flow</h2>
        <p className="mb-0">
          Better Auth now handles identity with passkeys first and magic-link fallback. API authorization uses secure
          session cookies instead of custom bearer tokens.
        </p>
        <ol className="step-list">
          <li className="step-item">
            <span className="step-number">1</span>
            <div className="step-content">
              <strong>Sign in</strong>
              <p>
                Use passkey authentication from <code>/auth</code>. If passkeys are unavailable, request a magic link
                with <code>POST /api/auth/sign-in/magic-link</code>.
              </p>
            </div>
          </li>
          <li className="step-item">
            <span className="step-number">2</span>
            <div className="step-content">
              <strong>Link wallets</strong>
              <p>
                Link one or more wallet bots to your account via <code>/api/account/wallets/link/challenge</code> and{" "}
                <code>/api/account/wallets/link/verify</code>.
              </p>
            </div>
          </li>
          <li className="step-item">
            <span className="step-number">3</span>
            <div className="step-content">
              <strong>Act with account session + active bot</strong>
              <p>
                Set active bot context with <code>/api/account/active-bot</code> and call protected endpoints using the
                same browser session cookie.
              </p>
            </div>
          </li>
        </ol>
      </section>

      <section className="card section">
        <h2>API reference</h2>

        <h3 className="api-group-title">Authentication</h3>
        <EndpointList items={authEndpoints} />

        <h3 className="api-group-title api-group-title--spaced">Action signing</h3>
        <p className="api-group-note mb-0">
          Required for wallet-signed write proofs. Account-session-only treasury actions are also supported.
        </p>
        <EndpointList items={actionEndpoints} />

        <h3 className="api-group-title api-group-title--spaced">Account linking</h3>
        <EndpointList items={accountEndpoints} />

        <h3 className="api-group-title api-group-title--spaced">Notes</h3>
        <EndpointList items={noteEndpoints} />

        <h3 className="api-group-title api-group-title--spaced">Billing</h3>
        <EndpointList items={billingEndpoints} />

        <h3 className="api-group-title api-group-title--spaced">Treasury governance</h3>
        <EndpointList items={treasuryEndpoints} />

        <h3 className="api-group-title api-group-title--spaced">Public</h3>
        <EndpointList items={publicEndpoints} />
      </section>
    </main>
  );
}
