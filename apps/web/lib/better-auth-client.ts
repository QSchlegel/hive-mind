"use client";

import { createAuthClient } from "better-auth/react";
import { magicLinkClient } from "better-auth/client/plugins";
import { passkeyClient } from "@better-auth/passkey/client";

function resolveBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_BETTER_AUTH_URL?.trim();
  const basePath = !configured ? "/api/auth" : configured;

  const withoutSlash = basePath.endsWith("/") ? basePath.slice(0, -1) : basePath;
  const withAuthPath = withoutSlash.endsWith("/api/auth") ? withoutSlash : `${withoutSlash}/api/auth`;

  if (withAuthPath.startsWith("http://") || withAuthPath.startsWith("https://")) {
    return withAuthPath;
  }

  const normalizedPath = withAuthPath.startsWith("/") ? withAuthPath : `/${withAuthPath}`;

  if (typeof window === "undefined") {
    return `http://localhost:3000${normalizedPath}`;
  }

  return new URL(normalizedPath, window.location.origin).toString();
}

export const authClient = createAuthClient({
  baseURL: resolveBaseUrl(),
  plugins: [magicLinkClient(), passkeyClient()]
});
