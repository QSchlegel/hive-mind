import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Hive Mind Club",
  description: "How Hive Mind Club collects, uses, and protects personal data."
};

const LAST_UPDATED = "February 23, 2026";

export default function PrivacyPage() {
  return (
    <main>
      <div className="page-header">
        <span className="kicker">Legal</span>
        <h1>Privacy Policy</h1>
        <p>How we handle your information when you use hive-mind.club.</p>
      </div>

      <div style={{ display: "grid", gap: "1rem", paddingBottom: "4rem" }}>
        <section className="card section">
          <p className="doc-section-title">Last Updated</p>
          <p style={{ margin: 0 }}>{LAST_UPDATED}</p>
        </section>

        <section className="card section">
          <h2>Information we collect</h2>
          <ul>
            <li>Waitlist submissions: email address, wallet address, blockchain, and bot use-case description.</li>
            <li>Account and auth data: email, session metadata, and authentication records if you use sign-in features.</li>
            <li>Operational data: request logs and security telemetry used for abuse prevention and reliability.</li>
          </ul>
        </section>

        <section className="card section">
          <h2>How we use information</h2>
          <ul>
            <li>Review waitlist submissions and send alpha access communications.</li>
            <li>Operate and secure the product, including fraud and abuse prevention.</li>
            <li>Maintain platform reliability, troubleshoot incidents, and improve product quality.</li>
          </ul>
        </section>

        <section className="card section">
          <h2>Sharing and storage</h2>
          <ul>
            <li>We do not sell personal information.</li>
            <li>Data may be processed by trusted infrastructure and email providers acting on our behalf.</li>
            <li>We retain data only as long as needed for waitlist operations, legal obligations, and security purposes.</li>
          </ul>
        </section>

        <section className="card section">
          <h2>Your choices</h2>
          <p>
            You can request access, correction, or deletion of your waitlist data by emailing{" "}
            <a href="mailto:hello@hive-mind.club">hello@hive-mind.club</a>. You can also opt out of non-essential email
            updates at any time.
          </p>
          <p style={{ marginBottom: 0 }}>
            By submitting the waitlist form, you agree to this policy. For general questions, visit the{" "}
            <Link href="/docs">documentation</Link> or contact us directly.
          </p>
        </section>
      </div>
    </main>
  );
}
