"use client";

import { useState } from "react";
import { signOut } from "@/app/auth/actions";
import {
  invoiceStatusLabels,
  invoiceStatuses,
  type InvoiceStatus,
  type SavedInvoiceRecord,
} from "@/lib/saved-invoices";

type AppHeaderProps = {
  userEmail: string;
  saveState: "idle" | "saving" | "saved";
  savedInvoices: SavedInvoiceRecord[];
  isSavingInvoice: boolean;
  isExporting: boolean;
  onNewInvoice: () => void;
  onLoadSavedInvoice: (invoice: SavedInvoiceRecord) => void;
  onChangeInvoiceStatus: (invoice: SavedInvoiceRecord, status: InvoiceStatus) => void;
  onDeleteSavedInvoice: (invoice: SavedInvoiceRecord) => void;
  onSave: () => void;
  onExport: () => void;
  onSignOut: () => void;
};

export function AppHeader({
  userEmail,
  saveState,
  savedInvoices,
  isSavingInvoice,
  isExporting,
  onNewInvoice,
  onLoadSavedInvoice,
  onChangeInvoiceStatus,
  onDeleteSavedInvoice,
  onSave,
  onExport,
  onSignOut,
}: AppHeaderProps) {
  const [savedInvoicesOpen, setSavedInvoicesOpen] = useState(false);

  return (
    <header className="app-header">
      <a className="brand" href="#top" aria-label="Invoice Studio home">
        <span className="brand-mark" aria-hidden="true">IS</span>
        <span>Invoice Studio</span>
      </a>
      <div className="header-actions">
        <span className="save-status" aria-live="polite">
          <span className={`status-dot ${saveState}`} />
          {saveState === "saving" ? "Backing up…" : saveState === "saved" ? "Backed up locally" : "Recovery enabled"}
        </span>
        <div className="invoice-menu-wrap">
          <button
            className="button secondary"
            type="button"
            onClick={() => setSavedInvoicesOpen((open) => !open)}
            aria-expanded={savedInvoicesOpen}
          >
            Invoices <span className="count">{savedInvoices.length}</span>
          </button>
          {savedInvoicesOpen && (
            <div className="invoice-menu" aria-label="Saved invoices">
              <div className="invoice-menu-head">
                <strong>Saved invoices</strong>
                <button type="button" onClick={() => { setSavedInvoicesOpen(false); onNewInvoice(); }}>+ New</button>
              </div>
              {savedInvoices.length === 0 ? <p className="empty-state">No saved invoices yet.</p> : savedInvoices.map((record) => (
                <div className="invoice-record-row" key={record.invoice.id}>
                  <button type="button" className="invoice-load" onClick={() => { setSavedInvoicesOpen(false); onLoadSavedInvoice(record); }}>
                    <strong>{record.invoice.invoiceNumber}</strong>
                    <span>{record.invoice.client.name} · {new Date(record.updatedAt).toLocaleDateString()}</span>
                  </button>
                  <select
                    className={`status-select status-${record.status}`}
                    aria-label={`Status for ${record.invoice.invoiceNumber}`}
                    value={record.status}
                    onChange={(event) => onChangeInvoiceStatus(record, event.target.value as InvoiceStatus)}
                  >
                    {invoiceStatuses.map((status) => <option value={status} key={status}>{invoiceStatusLabels[status]}</option>)}
                  </select>
                  <button className="icon-button" type="button" aria-label={`Delete invoice ${record.invoice.invoiceNumber}`} onClick={() => onDeleteSavedInvoice(record)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="button primary header-save" type="button" onClick={onSave} disabled={isSavingInvoice}>
          {isSavingInvoice ? "Saving…" : "Save"}
        </button>
        <button className="button secondary header-download" type="button" onClick={onExport} disabled={isExporting}>
          {isExporting ? "Preparing…" : "Download PDF"}
        </button>
        <form action={signOut} className="account-control" onSubmit={onSignOut}>
          <span title={userEmail}>{userEmail}</span>
          <button className="button secondary" type="submit">Sign out</button>
        </form>
      </div>
    </header>
  );
}
