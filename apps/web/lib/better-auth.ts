import nodemailer, { type Transporter } from "nodemailer";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { passkey } from "@better-auth/passkey";
import { getEnv } from "./env";
import { getPool } from "./db";

let mailer: Transporter | null = null;
let cachedAuth: ReturnType<typeof betterAuth> | null = null;

function getBaseUrl(): string {
  const env = getEnv();
  return env.BETTER_AUTH_URL ?? (env.NODE_ENV === "production" ? `https://${env.APP_DOMAIN}` : "http://127.0.0.1:3000");
}

function getTrustedOrigins(baseURL: string): string[] {
  const env = getEnv();
  return Array.from(
    new Set([baseURL, `https://${env.APP_DOMAIN}`, `https://www.${env.APP_DOMAIN}`, "http://127.0.0.1:3000", "http://localhost:3000"])
  );
}

function getMailer(): Transporter {
  if (mailer) {
    return mailer;
  }

  const env = getEnv();
  if (!env.SMTP_HOST || !env.SMTP_PORT || !env.SMTP_FROM) {
    throw new Error("SMTP is not configured");
  }

  mailer = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS ?? "" } : undefined
  });

  return mailer;
}

export function getAuth() {
  if (cachedAuth) {
    return cachedAuth;
  }

  const env = getEnv();
  const baseURL = getBaseUrl();
  const trustedOrigins = getTrustedOrigins(baseURL);
  const rpID = new URL(baseURL).hostname;

  cachedAuth = betterAuth({
    appName: "Hive Mind Club",
    baseURL,
    secret: env.BETTER_AUTH_SECRET,
    database: getPool(),
    trustedOrigins,
    plugins: [
      nextCookies(),
      passkey({
        rpID,
        rpName: "Hive Mind Club",
        origin: trustedOrigins
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          const smtp = getMailer();
          await smtp.sendMail({
            from: env.SMTP_FROM,
            to: email,
            subject: "Sign in to Hive Mind Club",
            text: `Use this secure link to sign in:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
            html: `<p>Use this secure link to sign in:</p><p><a href="${url}">${url}</a></p><p>If you did not request this, you can ignore this email.</p>`
          });
        }
      })
    ]
  });

  return cachedAuth;
}
