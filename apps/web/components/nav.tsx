import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";

export function Nav() {
  return (
    <header className="nav">
      <div className="inner">
        <div style={{ display: "flex", alignItems: "center" }}>
          <Link href="/" className="nav-logo">
            hive-mind.club
          </Link>
          <nav className="nav-links" aria-label="Primary navigation">
            <Link href="/app">App</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <span className="badge">invite-only alpha</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
