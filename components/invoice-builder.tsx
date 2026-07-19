"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { AppHeader } from "@/components/app-header";
import { DraftAutosave } from "@/components/invoice-form/draft-autosave";
import { InvoiceForm } from "@/components/invoice-form/invoice-form";
import { InvoicePreview } from "@/components/invoice-preview";
import { deleteDraft, readDrafts, type SavedDraft } from "@/lib/drafts";
import { clientRecordSchema, profileSchema, type ClientRecord, type Profile } from "@/lib/contacts";
import { readJsonResponse } from "@/lib/api-response";
import { createDefaultInvoice, invoiceSchema, type Invoice } from "@/lib/invoice";
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
  const currentInvoiceId = useWatch({ control: form.control, name: "id" });

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
    if (form.getValues("id") === id) newInvoice();
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
      if (followingNumber && currentInvoiceId === updated.invoice.id) {
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
    if (currentInvoiceId === record.invoice.id) newInvoice(followingNumber ?? nextInvoiceNumber);
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

  const currentSavedInvoice = savedInvoices.find((record) => record.invoice.id === currentInvoiceId);

  return (
    <FormProvider {...form}>
      <DraftAutosave onDraftsChange={setDrafts} onSaveStateChange={setSaveState} />
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

            <InvoiceForm
              clients={clients}
              selectedClientId={selectedClientId}
              isSavingInvoice={isSavingInvoice}
              isExporting={isExporting}
              onSelectClient={chooseClient}
              onSaveProfile={saveProfileDetails}
              onSaveClient={saveCurrentClient}
              onDeleteClient={deleteCurrentClient}
              onSaveInvoice={saveInvoiceToDatabase}
              onExport={exportPdf}
            />
          </section>

          <aside className="preview-panel">
            <div className="preview-toolbar">
              <span>Live preview</span>
              <span>Updates automatically</span>
            </div>
            <InvoicePreview />
          </aside>
        </div>
      </main>
    </FormProvider>
  );
}
