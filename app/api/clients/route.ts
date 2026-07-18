import { NextResponse } from "next/server";
import { clientInputSchema } from "@/lib/contacts";
import { listClients, saveClient } from "@/lib/database";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ clients: await listClients(userId) });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = clientInputSchema.safeParse(await request.json());
  if (!result.success) {
    return NextResponse.json({ error: "Invalid client", issues: result.error.issues }, { status: 400 });
  }
  return NextResponse.json({ client: await saveClient(userId, result.data) });
}
