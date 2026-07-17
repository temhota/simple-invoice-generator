import { NextResponse } from "next/server";
import { invoiceSchema } from "@/lib/invoice";
import { listInvoices, saveInvoice } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ invoices: await listInvoices() });
}

export async function POST(request: Request) {
  const result = invoiceSchema.safeParse(await request.json());
  if (!result.success) {
    return NextResponse.json({ error: "Invalid invoice", issues: result.error.issues }, { status: 400 });
  }
  try {
    return NextResponse.json({ invoice: await saveInvoice(result.data) });
  } catch (error) {
    const conflict = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
    return NextResponse.json(
      { error: conflict ? "Invoice number already exists" : "Could not save invoice" },
      { status: conflict ? 409 : 500 },
    );
  }
}
