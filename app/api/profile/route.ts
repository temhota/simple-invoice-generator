import { NextResponse } from "next/server";
import { profileSchema } from "@/lib/contacts";
import { getProfile, saveProfile } from "@/lib/database";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ profile: await getProfile(userId) });
}

export async function PUT(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = profileSchema.safeParse(await request.json());
  if (!result.success) {
    return NextResponse.json({ error: "Invalid profile", issues: result.error.issues }, { status: 400 });
  }
  return NextResponse.json({ profile: await saveProfile(userId, result.data) });
}
