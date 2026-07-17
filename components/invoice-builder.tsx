"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { AppHeader } from "@/components/app-header";
import { CurrencyField } from "@/components/currency-field";
import { InvoicePreview } from "@/components/invoice-preview";
import { deleteDraft, readDrafts, saveDraft, type SavedDraft } from "@/lib/drafts";
import { clientRecordSchema, profileSchema, type ClientRecord, type Profile } from "@/lib/contacts";
import {
  createDefaultInvoice,
  currencies,
  invoiceSchema,
  makeId,
  type Invoice,
} from "@/lib/invoice";
import { downloadInvoicePdf } from "@/lib/pdf";
import {
  invoiceStatusLabels,
  savedInvoiceRecordSchema,
  type InvoiceStatus,
  type SavedInvoiceRecord,
} from "@/lib/saved-invoices";

type SaveState = "idle" | "saving" | "saved";

type InvoiceBuilderProps = {
  initialProfile: Profile | null;
  initialClients: ClientRecord[];
  initialSavedInvoices: SavedInvoiceRecord[];
  initialNextInvoiceNumber: string | null;
  initialDataError: boolean;
  userEmail: string;
};

function ErrorMessage({ message }: { message?: string }) {
  return message ? <p className="field-error" role="alert">{message}</p> : null;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const body = await response.text();
  if (!body) return null;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return null;
  }
}

export function InvoiceBuilder({
  initialProfile,
  initialClients,
  initialSavedInvoices,
  initialNextInvoiceNumber,
  initialDataError,
  userEmail,
}: InvoiceBuilderProps) {
  const initialInvoice = useMemo(() => {
    const invoice = createDefaultInvoice();
    if (initialNextInvoiceNumber) invoice.invoiceNumber = initialNextInvoiceNumber;
    return invoice;
  }, [initialNextInvoiceNumber]);
  const [drafts, setDrafts] = useState<SavedDraft[]>([]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isExporting, setIsExporting] = useState(false);
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [databaseMessage, setDatabaseMessage] = useState(
    initialDataError ? "Some database data is temporarily unavailable." : "",
  );
  const [savedInvoices, setSavedInvoices] = useState<SavedInvoiceRecord[]>(initialSavedInvoices);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(initialInvoice.invoiceNumber);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(initialProfile);
  const form = useForm<Invoice>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: initialInvoice,
    mode: "onBlur",
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const invoice = useWatch({ control: form.control }) as Invoice;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const stored = readDrafts();
      setDrafts(stored);
      if (stored[0]) {
        form.reset(stored[0].invoice);
        return;
      }
      if (initialProfile) {
        form.setValue("issuer", {
          name: initialProfile.name,
          email: initialProfile.email,
          address: initialProfile.address,
          taxNumber: initialProfile.taxNumber,
          vatNumber: initialProfile.vatNumber,
        });
        form.setValue("banking", {
          accountName: initialProfile.name,
          iban: initialProfile.iban,
          bic: initialProfile.bic,
        });
      }
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [form, initialProfile]);

  useEffect(() => {
    if (!invoice?.id) return;
    const savingTimeout = window.setTimeout(() => setSaveState("saving"), 0);
    const saveTimeout = window.setTimeout(() => {
      setDrafts(saveDraft(invoice));
      setSaveState("saved");
    }, 500);
    return () => {
      window.clearTimeout(savingTimeout);
      window.clearTimeout(saveTimeout);
    };
  }, [invoice]);

  const newInvoice = (invoiceNumber = nextInvoiceNumber) => {
    const freshInvoice = createDefaultInvoice();
    freshInvoice.invoiceNumber = invoiceNumber;
    if (savedProfile) {
      freshInvoice.issuer = {
        name: savedProfile.name,
        email: savedProfile.email,
        address: savedProfile.address,
        taxNumber: savedProfile.taxNumber,
        vatNumber: savedProfile.vatNumber,
      };
      freshInvoice.banking = {
        accountName: savedProfile.name,
        iban: savedProfile.iban,
        bic: savedProfile.bic,
      };
    }
    form.reset(freshInvoice);
    setSelectedClientId("");
    setDatabaseMessage(`New invoice ${invoiceNumber} is ready.`);
  };

  const loadDraft = (draft: SavedDraft) => {
    form.reset(draft.invoice);
  };

  const removeDraft = (id: string) => {
    setDrafts(deleteDraft(id));
    if (invoice.id === id) newInvoice();
  };

  const exportPdf = form.handleSubmit(async (validInvoice) => {
    setIsExporting(true);
    try {
      await downloadInvoicePdf(validInvoice);
    } finally {
      setIsExporting(false);
    }
  });

  const fetchNextNumber = async (): Promise<string | null> => {
    const response = await fetch("/api/invoices/next-number");
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    const number = (payload as { invoiceNumber?: unknown }).invoiceNumber;
    if (typeof number !== "string") return null;
    setNextInvoiceNumber(number);
    return number;
  };

  const saveInvoiceToDatabase = form.handleSubmit(async (validInvoice) => {
    setIsSavingInvoice(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validInvoice),
      });
      const payload: unknown = await response.json();
      const result = savedInvoiceRecordSchema.safeParse((payload as { invoice?: unknown }).invoice);
      if (!response.ok || !result.success) {
        const error = (payload as { error?: unknown }).error;
        setDatabaseMessage(typeof error === "string" ? error : "Could not save the invoice.");
        return;
      }
      const saved = result.data;
      setSavedInvoices((current) => [saved, ...current.filter((record) => record.invoice.id !== saved.invoice.id)]);
      await fetchNextNumber();
      setDatabaseMessage(`${saved.invoice.invoiceNumber} saved as ${invoiceStatusLabels[saved.status]}.`);
    } finally {
      setIsSavingInvoice(false);
    }
  });

  const loadSavedInvoice = (record: SavedInvoiceRecord) => {
    form.reset(record.invoice);
    setDatabaseMessage(`${record.invoice.invoiceNumber} loaded (${invoiceStatusLabels[record.status]}).`);
  };

  const changeInvoiceStatus = async (record: SavedInvoiceRecord, status: InvoiceStatus) => {
    const response = await fetch(`/api/invoices/${record.invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload: unknown = await response.json();
    const result = savedInvoiceRecordSchema.safeParse((payload as { invoice?: unknown }).invoice);
    if (!response.ok || !result.success) {
      setDatabaseMessage("Could not update invoice status.");
      return;
    }
    const updated = result.data;
    setSavedInvoices((current) => current.map((candidate) => candidate.invoice.id === updated.invoice.id ? updated : candidate));

    if (status === "sent") {
      const followingNumber = await fetchNextNumber();
      if (followingNumber && invoice.id === updated.invoice.id) {
        newInvoice(followingNumber);
        setDatabaseMessage(`${updated.invoice.invoiceNumber} marked Sent. ${followingNumber} is ready.`);
        return;
      }
    }
    setDatabaseMessage(`${updated.invoice.invoiceNumber} marked ${invoiceStatusLabels[status]}.`);
  };

  const deleteSavedInvoice = async (record: SavedInvoiceRecord) => {
    const response = await fetch(`/api/invoices/${record.invoice.id}`, { method: "DELETE" });
    if (!response.ok) {
      setDatabaseMessage("Could not delete the invoice.");
      return;
    }
    setSavedInvoices((current) => current.filter((candidate) => candidate.invoice.id !== record.invoice.id));
    const followingNumber = await fetchNextNumber();
    if (invoice.id === record.invoice.id) newInvoice(followingNumber ?? nextInvoiceNumber);
    setDatabaseMessage(`${record.invoice.invoiceNumber} deleted.`);
  };

  const saveProfileDetails = async () => {
    const valid = await form.trigger(["issuer", "banking"]);
    if (!valid) {
      setDatabaseMessage("Complete your details before saving.");
      return;
    }
    const values = form.getValues();
    const response = await fetch("/api/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: values.issuer.name,
        email: values.issuer.email,
        address: values.issuer.address,
        taxNumber: values.issuer.taxNumber,
        vatNumber: values.issuer.vatNumber,
        iban: values.banking.iban,
        bic: values.banking.bic,
      }),
    });
    const payload: unknown = await response.json();
    const result = profileSchema.safeParse((payload as { profile?: unknown }).profile);
    if (response.ok && result.success) {
      setSavedProfile(result.data);
      setDatabaseMessage("Your details were saved to the database.");
    } else {
      setDatabaseMessage("Could not save your details.");
    }
  };

  const chooseClient = (id: string) => {
    setSelectedClientId(id);
    const client = clients.find((candidate) => candidate.id === id);
    if (!client) return;
    form.setValue("client", {
      name: client.name,
      email: client.email,
      address: client.address,
      vatNumber: client.vatNumber,
    }, { shouldDirty: true });
    setDatabaseMessage(`${client.name} loaded.`);
  };

  const saveCurrentClient = async () => {
    const valid = await form.trigger("client");
    if (!valid) {
      setDatabaseMessage("Complete the client details before saving.");
      return;
    }
    let response: Response;
    try {
      response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedClientId || undefined, ...form.getValues("client") }),
      });
    } catch {
      setDatabaseMessage("Could not reach the database.");
      return;
    }
    const payload = await readJsonResponse(response);
    const result = clientRecordSchema.safeParse(
      payload && typeof payload === "object" ? (payload as { client?: unknown }).client : undefined,
    );
    if (!response.ok || !result.success) {
      setDatabaseMessage("Could not save the client.");
      return;
    }
    const saved = result.data;
    setClients((current) => [...current.filter((client) => client.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedClientId(saved.id);
    setDatabaseMessage(`${saved.name} was saved to the database.`);
  };

  const deleteCurrentClient = async () => {
    if (!selectedClientId) return;
    const response = await fetch(`/api/clients/${selectedClientId}`, { method: "DELETE" });
    if (!response.ok) {
      setDatabaseMessage("Could not delete the client.");
      return;
    }
    setClients((current) => current.filter((client) => client.id !== selectedClientId));
    setSelectedClientId("");
    setDatabaseMessage("Client deleted.");
  };

  const currentSavedInvoice = savedInvoices.find((record) => record.invoice.id === invoice.id);

  return (
    <main className="app-shell">
      <AppHeader
        userEmail={userEmail}
        saveState={saveState}
        drafts={drafts}
        savedInvoices={savedInvoices}
        isSavingInvoice={isSavingInvoice}
        isExporting={isExporting}
        onNewInvoice={() => newInvoice()}
        onLoadDraft={loadDraft}
        onRemoveDraft={removeDraft}
        onLoadSavedInvoice={loadSavedInvoice}
        onChangeInvoiceStatus={changeInvoiceStatus}
        onDeleteSavedInvoice={deleteSavedInvoice}
        onSave={saveInvoiceToDatabase}
        onExport={exportPdf}
      />

      <div className="workspace" id="top">
        <section className="editor" aria-labelledby="editor-title">
          <div className="section-intro">
            <p className="eyebrow">
              {currentSavedInvoice
                ? `Saved · ${invoiceStatusLabels[currentSavedInvoice.status]}`
                : "New invoice"}
            </p>
            <h1 id="editor-title">Create your invoice</h1>
            <p>Fill in the details. Your draft stays in this browser.</p>
            <p className="database-message" aria-live="polite">{databaseMessage}</p>
          </div>

          <form onSubmit={exportPdf} noValidate>
            <fieldset className="form-card">
              <legend>Invoice details</legend>
              <div className="form-grid invoice-details-grid">
                <label>
                  <span>Invoice number</span>
                  <input {...form.register("invoiceNumber")} aria-invalid={Boolean(form.formState.errors.invoiceNumber)} />
                  <ErrorMessage message={form.formState.errors.invoiceNumber?.message} />
                </label>
                <label>
                  <span>Work start</span>
                  <input type="date" {...form.register("workStartDate")} aria-invalid={Boolean(form.formState.errors.workStartDate)} />
                  <ErrorMessage message={form.formState.errors.workStartDate?.message} />
                </label>
                <label>
                  <span>Work end</span>
                  <input type="date" {...form.register("workEndDate")} aria-invalid={Boolean(form.formState.errors.workEndDate)} />
                  <ErrorMessage message={form.formState.errors.workEndDate?.message} />
                </label>
                <label>
                  <span>Due date</span>
                  <input type="date" {...form.register("dueDate")} aria-invalid={Boolean(form.formState.errors.dueDate)} />
                  <ErrorMessage message={form.formState.errors.dueDate?.message} />
                </label>
              </div>
            </fieldset>

            <div className="party-form-grid">
              {(["issuer", "client"] as const).map((party) => (
                <fieldset className="form-card" key={party}>
                  <legend>{party === "issuer" ? "From" : "Bill to"}</legend>
                  <div className="stack">
                    {party === "client" && (
                      <div className="saved-client-controls">
                        <label>
                          <span>Saved clients</span>
                          <select value={selectedClientId} onChange={(event) => chooseClient(event.target.value)}>
                            <option value="">New client</option>
                            {clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
                          </select>
                        </label>
                        <button className="button secondary delete-client-button" type="button" onClick={deleteCurrentClient} disabled={!selectedClientId}>Delete</button>
                      </div>
                    )}
                    <label>
                      <span>{party === "issuer" ? "Business name" : "Client name"}</span>
                      <input placeholder={party === "issuer" ? "Acme Studio" : "Northstar GmbH"} {...form.register(`${party}.name`)} aria-invalid={Boolean(form.formState.errors[party]?.name)} />
                      <ErrorMessage message={form.formState.errors[party]?.name?.message} />
                    </label>
                    <label>
                      <span>Email <small>Optional</small></span>
                      <input type="email" placeholder="hello@example.com" {...form.register(`${party}.email`)} aria-invalid={Boolean(form.formState.errors[party]?.email)} />
                      <ErrorMessage message={form.formState.errors[party]?.email?.message} />
                    </label>
                    <label>
                      <span>Address</span>
                      <textarea rows={3} placeholder="Street, city, country" {...form.register(`${party}.address`)} aria-invalid={Boolean(form.formState.errors[party]?.address)} />
                      <ErrorMessage message={form.formState.errors[party]?.address?.message} />
                    </label>
                    {party === "issuer" && (
                      <div className="form-grid two-cols">
                        <label>
                          <span>Tax number <small>Optional</small></span>
                          <input placeholder="Tax ID" {...form.register("issuer.taxNumber")} aria-invalid={Boolean(form.formState.errors.issuer?.taxNumber)} />
                          <ErrorMessage message={form.formState.errors.issuer?.taxNumber?.message} />
                        </label>
                        <label>
                          <span>VAT number <small>Optional</small></span>
                          <input placeholder="VAT ID" {...form.register("issuer.vatNumber")} aria-invalid={Boolean(form.formState.errors.issuer?.vatNumber)} />
                          <ErrorMessage message={form.formState.errors.issuer?.vatNumber?.message} />
                        </label>
                      </div>
                    )}
                    {party === "client" && (
                      <label>
                        <span>VAT number <small>Optional</small></span>
                        <input placeholder="VAT ID" {...form.register("client.vatNumber")} aria-invalid={Boolean(form.formState.errors.client?.vatNumber)} />
                        <ErrorMessage message={form.formState.errors.client?.vatNumber?.message} />
                      </label>
                    )}
                    <button className="button secondary database-save-button" type="button" onClick={party === "issuer" ? saveProfileDetails : saveCurrentClient}>
                      {party === "issuer" ? "Save my details" : selectedClientId ? "Update client" : "Save client"}
                    </button>
                  </div>
                </fieldset>
              ))}
            </div>

            <fieldset className="form-card items-card">
              <legend className="sr-only">Line items</legend>
              <div className="legend-row">
                <span>Line items</span>
                <button className="text-button" type="button" onClick={() => append({ id: makeId(), description: "", hours: 1, unitPriceCents: 0 })}>+ Add item</button>
              </div>
              <div className="items-list">
                {fields.map((field, index) => (
                  <div className="item-row" key={field.id}>
                    <label className="item-description">
                      <span>Description</span>
                      <input placeholder="Website design" {...form.register(`items.${index}.description`)} aria-invalid={Boolean(form.formState.errors.items?.[index]?.description)} />
                      <ErrorMessage message={form.formState.errors.items?.[index]?.description?.message} />
                    </label>
                    <label>
                      <span>Hours</span>
                      <input type="number" min="0.25" max="9999" step="0.25" {...form.register(`items.${index}.hours`, { valueAsNumber: true })} aria-invalid={Boolean(form.formState.errors.items?.[index]?.hours)} />
                      <ErrorMessage message={form.formState.errors.items?.[index]?.hours?.message} />
                    </label>
                    <label>
                      <span>Hourly rate</span>
                      <Controller control={form.control} name={`items.${index}.unitPriceCents`} render={({ field: priceField }) => (
                        <CurrencyField value={priceField.value} onChange={priceField.onChange} onBlur={priceField.onBlur} aria-invalid={Boolean(form.formState.errors.items?.[index]?.unitPriceCents)} />
                      )} />
                      <ErrorMessage message={form.formState.errors.items?.[index]?.unitPriceCents?.message} />
                    </label>
                    <button className="remove-button" type="button" onClick={() => remove(index)} disabled={fields.length === 1} aria-label={`Remove item ${index + 1}`}>×</button>
                  </div>
                ))}
              </div>
              <ErrorMessage message={form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message} />
            </fieldset>

            <fieldset className="form-card">
              <legend>Banking information</legend>
              <div className="form-grid three-cols banking-grid">
                <label>
                  <span>Name</span>
                  <input placeholder="Acme Studio" {...form.register("banking.accountName")} aria-invalid={Boolean(form.formState.errors.banking?.accountName)} />
                  <ErrorMessage message={form.formState.errors.banking?.accountName?.message} />
                </label>
                <label>
                  <span>IBAN</span>
                  <input autoCapitalize="characters" spellCheck={false} placeholder="DE00 0000 0000 0000 0000 00" {...form.register("banking.iban")} aria-invalid={Boolean(form.formState.errors.banking?.iban)} />
                  <ErrorMessage message={form.formState.errors.banking?.iban?.message} />
                </label>
                <label>
                  <span>BIC</span>
                  <input autoCapitalize="characters" spellCheck={false} placeholder="ABCDEFGH" {...form.register("banking.bic")} aria-invalid={Boolean(form.formState.errors.banking?.bic)} />
                  <ErrorMessage message={form.formState.errors.banking?.bic?.message} />
                </label>
              </div>
            </fieldset>

            <fieldset className="form-card">
              <legend>Payment details</legend>
              <div className="form-grid payment-grid">
                <label>
                  <span>Currency</span>
                  <select {...form.register("currency")}>
                    {currencies.map((currency) => <option value={currency} key={currency}>{currency}</option>)}
                  </select>
                </label>
                <label>
                  <span>VAT rate (%)</span>
                  <Controller control={form.control} name="taxRateBps" render={({ field }) => (
                    <select disabled={invoice.reverseCharge} value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} onBlur={field.onBlur}>
                      <option value={0}>0%</option>
                      <option value={1900}>19%</option>
                    </select>
                  )} />
                </label>
                <label className="reverse-charge-field">
                  <Controller control={form.control} name="reverseCharge" render={({ field }) => (
                    <span className="checkbox-control">
                      <input
                        type="checkbox"
                        checked={field.value}
                        onChange={(event) => {
                          field.onChange(event.target.checked);
                          if (event.target.checked) form.setValue("taxRateBps", 0, { shouldValidate: true, shouldDirty: true });
                        }}
                        onBlur={field.onBlur}
                      />
                      <span>Apply reverse charge</span>
                    </span>
                  )} />
                  <small>VAT is set to 0% and locked.</small>
                </label>
                <label className="notes-field">
                  <span>Notes <small>Optional</small></span>
                  <textarea rows={3} placeholder="Payment terms or a thank-you note" {...form.register("notes")} />
                  <ErrorMessage message={form.formState.errors.notes?.message} />
                </label>
              </div>
            </fieldset>

            <div className="mobile-actions">
              <button className="button primary" type="button" onClick={saveInvoiceToDatabase} disabled={isSavingInvoice}>
                {isSavingInvoice ? "Saving…" : "Save"}
              </button>
              <button className="button secondary" type="submit" disabled={isExporting}>
                {isExporting ? "Preparing PDF…" : "Download PDF"}
              </button>
            </div>
          </form>
        </section>

        <aside className="preview-panel">
          <div className="preview-toolbar"><span>Live preview</span><span>Updates automatically</span></div>
          <InvoicePreview invoice={invoice} />
        </aside>
      </div>
    </main>
  );
}
