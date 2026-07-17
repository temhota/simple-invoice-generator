import { InvoiceBuilder } from "@/components/invoice-builder";
import { getNextInvoiceNumber, getProfile, listClients, listInvoices } from "@/lib/database";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
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
    />
  );
}
