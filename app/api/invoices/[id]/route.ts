import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteInvoice, updateInvoiceStatus } from "@/lib/database";
import { invoiceStatusSchema } from "@/lib/saved-invoices";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: RouteContext<"/api/invoices/[id]">) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }
  const payload = await request.json();
  const status = invoiceStatusSchema.safeParse((payload as { status?: unknown }).status);
  if (!status.success) {
    return NextResponse.json({ error: "Invalid invoice status" }, { status: 400 });
  }
  const invoice = await updateInvoiceStatus(id, status.data);
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json({ invoice });
}

export async function DELETE(_request: Request, context: RouteContext<"/api/invoices/[id]">) {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid invoice id" }, { status: 400 });
  }
  if (!await deleteInvoice(id)) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
