import { NextResponse } from "next/server";
import { getNextInvoiceNumber } from "@/lib/database";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ invoiceNumber: await getNextInvoiceNumber(userId) });
}
