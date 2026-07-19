import type { BaseSyntheticEvent } from "react";
import { BankingSection } from "@/components/invoice-form/banking-section";
import { ClientSection } from "@/components/invoice-form/client-section";
import { InvoiceDetailsSection } from "@/components/invoice-form/invoice-details-section";
import { IssuerSection } from "@/components/invoice-form/issuer-section";
import { LineItemsSection } from "@/components/invoice-form/line-items-section";
import { PaymentSection } from "@/components/invoice-form/payment-section";
import type { ClientRecord } from "@/lib/contacts";

type InvoiceFormProps = {
  clients: ClientRecord[];
  selectedClientId: string;
  isSavingInvoice: boolean;
  isExporting: boolean;
  onSelectClient: (id: string) => void;
  onSaveProfile: () => void;
  onSaveClient: () => void;
  onDeleteClient: () => void;
  onSaveInvoice: () => void;
  onExport: (event?: BaseSyntheticEvent) => Promise<void>;
};

export function InvoiceForm({
  clients,
  selectedClientId,
  isSavingInvoice,
  isExporting,
  onSelectClient,
  onSaveProfile,
  onSaveClient,
  onDeleteClient,
  onSaveInvoice,
  onExport,
}: InvoiceFormProps) {
  return (
    <form onSubmit={onExport} noValidate>
      <InvoiceDetailsSection />
      <div className="party-form-grid">
        <IssuerSection onSave={onSaveProfile} />
        <ClientSection
          clients={clients}
          selectedClientId={selectedClientId}
          onSelect={onSelectClient}
          onSave={onSaveClient}
          onDelete={onDeleteClient}
        />
      </div>
      <LineItemsSection />
      <BankingSection />
      <PaymentSection />

      <div className="mobile-actions">
        <button className="button primary" type="button" onClick={onSaveInvoice} disabled={isSavingInvoice}>
          {isSavingInvoice ? "Saving…" : "Save"}
        </button>
        <button className="button secondary" type="submit" disabled={isExporting}>
          {isExporting ? "Preparing PDF…" : "Download PDF"}
        </button>
      </div>
    </form>
  );
}
