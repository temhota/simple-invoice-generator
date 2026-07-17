import { InvoiceBuilder } from "@/components/invoice-builder";
import { redirect } from "next/navigation";
import { getInitialInvoiceData } from "@/lib/database";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  const userEmail = typeof data.claims.email === "string" ? data.claims.email : "Signed in";

  const initialData = await getInitialInvoiceData().catch(() => null);

  return (
    <InvoiceBuilder
      initialProfile={initialData?.profile ?? null}
      initialClients={initialData?.clients ?? []}
      initialSavedInvoices={initialData?.invoices ?? []}
      initialNextInvoiceNumber={initialData?.nextInvoiceNumber ?? null}
      initialDataError={!initialData}
      userEmail={userEmail}
    />
  );
}
