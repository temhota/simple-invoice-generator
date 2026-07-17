import { NextResponse } from "next/server";
import { getNextInvoiceNumber } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ invoiceNumber: await getNextInvoiceNumber() });
}
