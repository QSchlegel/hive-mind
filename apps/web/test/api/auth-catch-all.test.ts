import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAuth: vi.fn(() => ({ handler: vi.fn() })),
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  put: vi.fn(),
  del: vi.fn()
}));

vi.mock("@/lib/better-auth", () => ({
  getAuth: mocks.getAuth
}));

vi.mock("better-auth/next-js", () => ({
  toNextJsHandler: vi.fn(() => ({
    GET: mocks.get,
    POST: mocks.post,
    PATCH: mocks.patch,
    PUT: mocks.put,
    DELETE: mocks.del
  }))
}));

import { GET, POST } from "../../app/api/auth/[...all]/route";

describe("auth catch-all route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards GET to better-auth handler", async () => {
    mocks.get.mockResolvedValueOnce(Response.json({ ok: true }));
    const request = new Request("https://hive-mind.test/api/auth/session", { method: "GET" });
    const response = await GET(request);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(mocks.get).toHaveBeenCalledWith(request);
  });

  it("forwards POST to better-auth handler", async () => {
    mocks.post.mockResolvedValueOnce(Response.json({ ok: true }, { status: 201 }));
    const request = new Request("https://hive-mind.test/api/auth/sign-in", { method: "POST", body: "{}" });
    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json.ok).toBe(true);
    expect(mocks.post).toHaveBeenCalledWith(request);
  });
});
