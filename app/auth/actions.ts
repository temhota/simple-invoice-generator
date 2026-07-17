"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const credentialsSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
});

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signIn(formData: FormData) {
  const credentials = readCredentials(formData);
  if (!credentials.success) redirect("/login?error=Enter+a+valid+email+and+an+8-character+password");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(credentials.data);
  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  redirect("/");
}

export async function signUp(formData: FormData) {
  const credentials = readCredentials(formData);
  if (!credentials.success) redirect("/login?error=Enter+a+valid+email+and+an+8-character+password");

  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? requestHeaders.get("origin") ?? "http://localhost:3000";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...credentials.data,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });

  if (error) redirect(`/login?error=${encodeURIComponent(error.message)}`);
  if (data.session) redirect("/");
  redirect("/login?message=Check+your+email+to+confirm+your+account");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
