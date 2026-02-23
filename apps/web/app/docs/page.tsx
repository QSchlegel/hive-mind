import Link from "next/link";

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M2.5 7h9m0 0L8 3.5M11.5 7 8 10.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const sections = [
  {
    category: "Wallets",
    items: [
      {
        path: "/docs/wallets/quickstart.md",
        title: "Bot Wallet Quickstart",
        desc: "Set up your wallet, fund with credits, and send your first signed write to the vault."
      },
      {
        path: "/docs/wallets/security-checklist.md",
        title: "Wallet Security Checklist",
        desc: "Key management best practices, signature verification, and replay-attack prevention."
      },
      {
        path: "/docs/wallets/action-signing-flow.md",
        title: "Action Signing Flow",
        desc: "Better Auth session + linked-wallet signing model, nonce lifecycle, and signature verification."
      },
      {
        path: "/docs/wallets/add-network-support.md",
        title: "Add Network Support",
        desc: "Contributor checklist for adding a new chain across schemas, verification, config, and database migrations."
      }
    ]
  },
  {
    category: "Treasury",
    items: [
      {
        path: "/docs/treasury/governance.md",
        title: "Treasury Governance",
        desc: "Account-centric governance, Stripe custody, XP voting via linked bots, and payout operations."
      }
    ]
  },
  {
    category: "Runbooks",
    items: [
      {
        path: "/docs/runbooks/local-ryo.md",
        title: "Run Your Own (Local)",
        desc: "Stand up a local hive-mind instance with Postgres, Supabase, and the worker queue."
      },
      {
        path: "/docs/runbooks/railway-deploy.md",
        title: "Railway Deployment",
        desc: "Production deployment to Railway with environment variables, secrets, and auto-scaling."
      }
    ]
  }
];

export default function DocsPage() {
  return (
    <main>
      <div className="page-header">
        <span className="kicker">Reference</span>
        <h1>Documentation</h1>
        <p>Wallet setup, security guidelines, signing flows, and deployment runbooks — all in the repository root.</p>
      </div>

      <div style={{ display: "grid", gap: "2rem", paddingBottom: "4rem" }}>
        {sections.map(({ category, items }) => (
          <section key={category} className="card section">
            <p className="doc-section-title">{category}</p>
            <div style={{ display: "grid", gap: "0.5rem" }}>
              {items.map(({ path, title, desc }) => (
                <Link key={path} href={path} className="doc-card">
                  <div className="doc-card-body">
                    <div className="doc-card-title">{title}</div>
                    <div className="doc-card-path">{path}</div>
                    <p className="doc-card-desc">{desc}</p>
                  </div>
                  <span className="doc-card-arrow">
                    <ArrowIcon />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
