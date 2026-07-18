import { NextResponse } from "next/server";
import { invoiceSchema } from "@/lib/invoice";
import { listInvoices, saveInvoice } from "@/lib/database";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ invoices: await listInvoices(userId) });
}

export async function POST(request: Request) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const result = invoiceSchema.safeParse(await request.json());
  if (!result.success) {
    return NextResponse.json({ error: "Invalid invoice", issues: result.error.issues }, { status: 400 });
  }
  try {
    return NextResponse.json({ invoice: await saveInvoice(userId, result.data) });
  } catch (error) {
    const conflict = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    return NextResponse.json(
      { error: conflict ? "Invoice number already exists" : "Could not save invoice" },
      { status: conflict ? 409 : 500 },
    );
  }
}
