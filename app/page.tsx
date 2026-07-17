import { InvoiceBuilder } from "@/components/invoice-builder";
import { redirect } from "next/navigation";
import { getNextInvoiceNumber, getProfile, listClients, listInvoices } from "@/lib/database";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) redirect("/login");
  const userEmail = typeof data.claims.email === "string" ? data.claims.email : "Signed in";

  const [profileResult, clientsResult, invoicesResult, nextNumberResult] = await Promise.allSettled([
    getProfile(),
    listClients(),
    listInvoices(),
    getNextInvoiceNumber(),
  ]);

  const initialDataError = [profileResult, clientsResult, invoicesResult, nextNumberResult]
    .some((result) => result.status === "rejected");

  return (
    <InvoiceBuilder
      initialProfile={profileResult.status === "fulfilled" ? profileResult.value : null}
      initialClients={clientsResult.status === "fulfilled" ? clientsResult.value : []}
      initialSavedInvoices={invoicesResult.status === "fulfilled" ? invoicesResult.value : []}
      initialNextInvoiceNumber={nextNumberResult.status === "fulfilled" ? nextNumberResult.value : null}
      initialDataError={initialDataError}
      userEmail={userEmail}
    />
  );
}
