import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { getEnv } from "./env";
import { getPool } from "./db";

let cachedAuth: ReturnType<typeof betterAuth> | null = null;
const RESEND_EMAILS_ENDPOINT = "https://api.resend.com/emails";
const MAGIC_LINK_SUBJECT = "Sign in to Hive Mind Club";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildMagicLinkEmail(url: string): { html: string; text: string } {
  const safeUrl = escapeHtml(url);
  const text = [
    "Sign in to Hive Mind Club",
    "",
    `Open this secure sign-in link: ${url}`,
    "",
    "If the button does not work, copy and paste the link into your browser.",
    "If you did not request this email, you can safely ignore it."
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${MAGIC_LINK_SUBJECT}</title>
  </head>
  <body style="margin:0;padding:0;background:#eef2fb;color:#0a1120;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef2fb;padding:28px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #d8e0ee;border-radius:18px;overflow:hidden;">
            <tr>
              <td style="padding:22px 24px;background:linear-gradient(120deg,#0a9d8f,#2457ff);color:#ffffff;">
                <p style="margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;font-weight:700;opacity:.95;">Hive Mind Club</p>
                <h1 style="margin:0;font-size:28px;line-height:1.2;">Your secure sign-in link</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:26px 24px 22px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#3f4f66;">
                  Continue to your account with the secure magic link below.
                </p>
                <p style="margin:0 0 22px;">
                  <a href="${safeUrl}" style="display:inline-block;padding:12px 22px;border-radius:999px;background:linear-gradient(110deg,#0a9d8f,#2457ff);color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;">Sign in to Hive Mind Club</a>
                </p>
                <p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:#5d6f89;">
                  If the button does not work, copy and paste this link:
                </p>
                <p style="margin:0;padding:10px 12px;border-radius:10px;background:#f4f7ff;border:1px solid #dfe6f4;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:#2457ff;">
                  ${safeUrl}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 24px 22px;border-top:1px solid #edf1f8;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:#7a8aa3;">
                  If you did not request this email, you can safely ignore it.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, text };
}

function hasResendConfig() {
  const env = getEnv();
  return Boolean(env.RESEND_API_KEY && env.RESEND_FROM);
}

function getBaseUrl(): string {
  const env = getEnv();
  return env.BETTER_AUTH_URL ?? (env.NODE_ENV === "production" ? `https://${env.APP_DOMAIN}` : "http://localhost:3000");
}

function getRpID(baseURL: string): string {
  const hostname = new URL(baseURL).hostname;
  if (hostname === "127.0.0.1" || hostname === "::1") {
    return "localhost";
  }

  return hostname;
}

function getTrustedOrigins(baseURL: string): string[] {
  const env = getEnv();
  return Array.from(
    new Set([baseURL, `https://${env.APP_DOMAIN}`, `https://www.${env.APP_DOMAIN}`, "http://127.0.0.1:3000", "http://localhost:3000"])
  );
}

async function sendMagicLinkWithResend(email: string, url: string): Promise<void> {
  const env = getEnv();
  const { html, text } = buildMagicLinkEmail(url);
  if (!hasResendConfig()) {
    if (env.NODE_ENV !== "production") {
      // Local/dev fallback keeps sign-in usable without external email setup.
      console.info(`[better-auth] Magic link for ${email}: ${url}`);
      return;
    }

    throw new Error("Resend is not configured. Set RESEND_API_KEY and RESEND_FROM.");
  }

  const response = await fetch(RESEND_EMAILS_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RESEND_FROM,
      to: [email],
      subject: MAGIC_LINK_SUBJECT,
      text,
      html
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => "");
    throw new Error(`Resend send email failed (${response.status}): ${details || response.statusText}`);
  }
}

export function getAuth() {
  if (cachedAuth) {
    return cachedAuth;
  }

  const env = getEnv();
  const baseURL = getBaseUrl();
  const trustedOrigins = getTrustedOrigins(baseURL);
  const rpID = getRpID(baseURL);

  cachedAuth = betterAuth({
    appName: "Hive Mind Club",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: getPool(),
    trustedOrigins,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      autoSignIn: true
    },
    plugins: [
      nextCookies(),
      passkey({
        rpID,
        rpName: "Hive Mind Club",
        origin: trustedOrigins
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkWithResend(email, url);
        }
      })
    ]
  });

  return cachedAuth;
}
