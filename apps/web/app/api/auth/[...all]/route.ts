import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/lib/better-auth";

export const dynamic = "force-dynamic";

function handler() {
  return toNextJsHandler(getAuth());
}

export async function GET(request: Request): Promise<Response> {
  return handler().GET(request);
}

export async function POST(request: Request): Promise<Response> {
  return handler().POST(request);
}

export async function PATCH(request: Request): Promise<Response> {
  return handler().PATCH(request);
}

export async function PUT(request: Request): Promise<Response> {
  return handler().PUT(request);
}

export async function DELETE(request: Request): Promise<Response> {
  return handler().DELETE(request);
}
