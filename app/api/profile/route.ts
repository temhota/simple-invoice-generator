import { NextResponse } from "next/server";
import { profileSchema } from "@/lib/contacts";
import { getProfile, saveProfile } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ profile: getProfile() });
}

export async function PUT(request: Request) {
  const result = profileSchema.safeParse(await request.json());
  if (!result.success) {
    return NextResponse.json({ error: "Invalid profile", issues: result.error.issues }, { status: 400 });
  }
  return NextResponse.json({ profile: saveProfile(result.data) });
}
