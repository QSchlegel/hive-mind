import Link from "next/link";
import { headers } from "next/headers";
import { BrandMark } from "./brand-mark";
import { ThemeToggle } from "./theme-toggle";
import { getAuth } from "@/lib/better-auth";

export async function Nav() {
  const requestHeaders = new Headers(await headers());
  const session = await getAuth()
    .api.getSession({ headers: requestHeaders })
    .catch(() => null);
  const isAuthed = Boolean(session?.user && session?.session);

  return (
    <header className="nav">
      <div className="inner">
        <div className="nav-start">
          <Link href="/" className="nav-logo" aria-label="Hive Mind home">
            <BrandMark className="nav-logo-mark" decorative />
          </Link>
          <nav className="nav-links" aria-label="Primary navigation">
            {isAuthed ? <Link href="/account">Account</Link> : null}
            <Link href="/app">App</Link>
            <Link href="/docs">Docs</Link>
          </nav>
        </div>
        <div className="nav-end">
          <span className="badge">invite-only alpha</span>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
