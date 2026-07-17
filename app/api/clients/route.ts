import { NextResponse } from "next/server";
import { clientInputSchema } from "@/lib/contacts";
import { listClients, saveClient } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ clients: await listClients() });
}

export async function POST(request: Request) {
  const result = clientInputSchema.safeParse(await request.json());
  if (!result.success) {
    return NextResponse.json({ error: "Invalid client", issues: result.error.issues }, { status: 400 });
  }
  return NextResponse.json({ client: await saveClient(result.data) });
}
