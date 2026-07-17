"use client";

import { useState } from "react";
import { signOut } from "@/app/auth/actions";
import type { SavedDraft } from "@/lib/drafts";
import {
  invoiceStatusLabels,
  invoiceStatuses,
  type InvoiceStatus,
  type SavedInvoiceRecord,
} from "@/lib/saved-invoices";

type AppHeaderProps = {
  userEmail: string;
  saveState: "idle" | "saving" | "saved";
  drafts: SavedDraft[];
  savedInvoices: SavedInvoiceRecord[];
  isSavingInvoice: boolean;
  isExporting: boolean;
  onNewInvoice: () => void;
  onLoadDraft: (draft: SavedDraft) => void;
  onRemoveDraft: (id: string) => void;
  onLoadSavedInvoice: (invoice: SavedInvoiceRecord) => void;
  onChangeInvoiceStatus: (invoice: SavedInvoiceRecord, status: InvoiceStatus) => void;
  onDeleteSavedInvoice: (invoice: SavedInvoiceRecord) => void;
  onSave: () => void;
  onExport: () => void;
};

export function AppHeader({
  userEmail,
  saveState,
  drafts,
  savedInvoices,
  isSavingInvoice,
  isExporting,
  onNewInvoice,
  onLoadDraft,
  onRemoveDraft,
  onLoadSavedInvoice,
  onChangeInvoiceStatus,
  onDeleteSavedInvoice,
  onSave,
  onExport,
}: AppHeaderProps) {
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [savedInvoicesOpen, setSavedInvoicesOpen] = useState(false);

  const closeMenus = () => {
    setDraftsOpen(false);
    setSavedInvoicesOpen(false);
  };

  return (
    <header className="app-header">
      <a className="brand" href="#top" aria-label="Invoice Studio home">
        <span className="brand-mark" aria-hidden="true">IS</span>
        <span>Invoice Studio</span>
      </a>
      <div className="header-actions">
        <span className="save-status" aria-live="polite">
          <span className={`status-dot ${saveState}`} />
          {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved locally" : "Local drafts"}
        </span>
        <div className="draft-menu-wrap">
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setDraftsOpen((open) => !open);
              setSavedInvoicesOpen(false);
            }}
            aria-expanded={draftsOpen}
          >
            Drafts <span className="count">{drafts.length}</span>
          </button>
          {draftsOpen && (
            <div className="draft-menu" aria-label="Saved drafts">
              <div className="draft-menu-head">
                <strong>Local drafts</strong>
                <button type="button" onClick={() => { closeMenus(); onNewInvoice(); }}>+ New</button>
              </div>
              {drafts.length === 0 ? <p className="empty-state">No saved drafts yet.</p> : drafts.map((draft) => (
                <div className="draft-row" key={draft.invoice.id}>
                  <button type="button" className="draft-load" onClick={() => { closeMenus(); onLoadDraft(draft); }}>
                    <strong>{draft.invoice.invoiceNumber || "Untitled invoice"}</strong>
                    <span>{draft.invoice.client.name || "No client"} · {new Date(draft.updatedAt).toLocaleString()}</span>
                  </button>
                  <button className="icon-button" type="button" aria-label={`Delete ${draft.invoice.invoiceNumber || "draft"}`} onClick={() => onRemoveDraft(draft.invoice.id)}>×</button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="draft-menu-wrap">
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setSavedInvoicesOpen((open) => !open);
              setDraftsOpen(false);
            }}
            aria-expanded={savedInvoicesOpen}
          >
            Invoices <span className="count">{savedInvoices.length}</span>
          </button>
          {savedInvoicesOpen && (
            <div className="draft-menu invoice-menu" aria-label="Saved invoices">
              <div className="draft-menu-head">
                <strong>Saved invoices</strong>
                <button type="button" onClick={() => { closeMenus(); onNewInvoice(); }}>+ New</button>
              </div>
              {savedInvoices.length === 0 ? <p className="empty-state">No saved invoices yet.</p> : savedInvoices.map((record) => (
                <div className="invoice-record-row" key={record.invoice.id}>
                  <button type="button" className="draft-load" onClick={() => { closeMenus(); onLoadSavedInvoice(record); }}>
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
        <form action={signOut} className="account-control">
          <span title={userEmail}>{userEmail}</span>
          <button className="button secondary" type="submit">Sign out</button>
        </form>
      </div>
    </header>
  );
}
