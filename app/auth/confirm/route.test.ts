// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const auth = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth }),
}));

beforeEach(() => {
  auth.exchangeCodeForSession.mockResolvedValue({
    data: { user: null, session: null },
    error: null,
  });
  auth.verifyOtp.mockResolvedValue({
    data: { user: null, session: null },
    error: null,
  });
});

describe.each([
  ["code exchange", "code=valid-code"],
  ["email OTP", "token_hash=valid-token&type=email"],
])("confirmation via %s", (_, credentials) => {
  it.each([
    "//external.example/path",
    "/\\external.example/path",
    "/\n/external.example",
    "https://external.example",
    "javascript:alert(1)",
    "//[",
  ])("keeps unsafe next=%j on the application origin", async (next) => {
    const response = await GET(
      new Request(
        `https://invoice.example/auth/confirm?${credentials}&next=${encodeURIComponent(next)}`,
      ),
    );
    expect(response.headers.get("location")).toBe("https://invoice.example/");
  });

  it("preserves a local path, query, and fragment", async () => {
    const response = await GET(
      new Request(
        `https://invoice.example/auth/confirm?${credentials}&next=${encodeURIComponent("/invoices?status=draft#recent")}`,
      ),
    );
    expect(response.headers.get("location")).toBe(
      "https://invoice.example/invoices?status=draft#recent",
    );
  });
});

it("sends failed confirmation to the login error page", async () => {
  auth.exchangeCodeForSession.mockResolvedValue({
    data: { user: null, session: null },
    error: new Error("Invalid code"),
  });
  const response = await GET(
    new Request(
      "https://invoice.example/auth/confirm?code=bad-code&next=/invoices",
    ),
  );
  expect(response.headers.get("location")).toBe(
    "https://invoice.example/login?error=Could+not+confirm+email",
  );
});
