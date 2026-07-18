import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteClient } from "@/lib/database";
import { getAuthenticatedUserId } from "@/lib/auth";

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext<"/api/clients/[id]">) {
  const userId = await getAuthenticatedUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid client id" }, { status: 400 });
  }
  if (!await deleteClient(userId, id)) {
    return NextResponse.json({ error: "Client not found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
