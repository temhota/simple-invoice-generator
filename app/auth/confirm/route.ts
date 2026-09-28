import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const code = url.searchParams.get("code");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const requestedNext = url.searchParams.get("next");
  let next = new URL("/", url.origin);
  if (requestedNext?.startsWith("/")) {
    try {
      const candidate = new URL(requestedNext, url.origin);
      if (candidate.origin === url.origin) next = candidate;
    } catch {
      // Malformed destinations fall back to the application home page.
    }
  }

  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(next);
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    if (!error) return NextResponse.redirect(next);
  }

  return NextResponse.redirect(
    new URL("/login?error=Could+not+confirm+email", url.origin),
  );
}
