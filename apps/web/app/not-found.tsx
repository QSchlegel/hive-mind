import Link from "next/link";

const recoveryLinks = [
  {
    href: "/docs",
    title: "Browse docs",
    description: "Jump back into the markdown knowledge base."
  },
  {
    href: "/app",
    title: "Open app",
    description: "Return to the live graph workspace."
  },
  {
    href: "/",
    title: "Home portal",
    description: "Head to the main landing page and re-route from there."
  }
];

export default function NotFound() {
  return (
    <main className="not-found-shell">
      <section className="not-found-panel card">
        <div className="not-found-aurora" aria-hidden="true" />
        <p className="kicker">Error 404</p>
        <h1>Signal lost in this branch of the hive.</h1>
        <p>
          The link you followed no longer maps to an active page. Use one of the recovery routes below to get back
          on track.
        </p>

        <div className="actions not-found-actions">
          <Link className="btn btn-primary" href="/docs">
            Open docs
          </Link>
          <Link className="btn btn-secondary" href="/">
            Return home
          </Link>
        </div>

        <div className="not-found-recovery-grid">
          {recoveryLinks.map((link) => (
            <Link key={link.href} href={link.href} className="not-found-recovery-card">
              <strong>{link.title}</strong>
              <span>{link.description}</span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
