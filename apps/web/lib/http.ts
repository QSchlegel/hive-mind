import { z } from "zod";
import { getEnv } from "./env";

export function jsonResponse(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function errorResponse(message: string, status = 400, details?: unknown): Response {
  return Response.json(
    {
      error: message,
      details
    },
    { status }
  );
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  const body = await request.json().catch(() => {
    throw new Error("Invalid JSON body");
  });
  return schema.parse(body);
}

function knownTrustedOrigins(): Set<string> {
  const env = getEnv();
  const origins = new Set<string>();

  if (env.BETTER_AUTH_URL) {
    origins.add(env.BETTER_AUTH_URL);
  }

  origins.add(`https://${env.APP_DOMAIN}`);
  origins.add(`https://www.${env.APP_DOMAIN}`);
  origins.add("http://127.0.0.1:3000");
  origins.add("http://localhost:3000");

  return origins;
}

function originFromHeaders(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer");
  if (!referer) {
    return null;
  }

  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function assertTrustedMutationOrigin(request: Request): void {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return;
  }

  const env = getEnv();
  const origin = originFromHeaders(request);
  if (!origin) {
    if (env.NODE_ENV !== "production") {
      return;
    }
    throw new Error("Missing origin header");
  }

  if (!knownTrustedOrigins().has(origin)) {
    throw new Error("Untrusted request origin");
  }
}
