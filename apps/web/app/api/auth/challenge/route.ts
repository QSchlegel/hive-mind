import { errorResponse } from "@/lib/http";

export async function POST(_request: Request): Promise<Response> {
  return errorResponse(
    "Wallet login endpoints are deprecated. Use Better Auth routes under /api/auth with passkey or magic-link sign-in.",
    410
  );
}
