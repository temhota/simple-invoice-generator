"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { AppHeader } from "@/components/app-header";
import { InvoiceForm } from "@/components/invoice-form/invoice-form";
import { RecoveryAutosave } from "@/components/invoice-form/recovery-autosave";
import { InvoicePreview } from "@/components/invoice-preview";
import {
  clientRecordSchema,
  profileSchema,
  type ClientRecord,
  type Profile,
} from "@/lib/contacts";
import { readJsonResponse } from "@/lib/api-response";
import {
  createDefaultInvoice,
  invoiceSchema,
  type Invoice,
} from "@/lib/invoice";
import {
  clearInvoiceRecovery,
  readInvoiceRecovery,
} from "@/lib/invoice-recovery";
import { downloadInvoicePdf } from "@/lib/pdf";
import {
  invoiceStatusLabels,
  savedInvoiceRecordSchema,
  type InvoiceStatus,
  type SavedInvoiceRecord,
} from "@/lib/saved-invoices";

type SaveState = "idle" | "saving" | "saved";

function matchesSavedInvoice(current: Invoice, saved: Invoice): boolean {
  const parsed = invoiceSchema.safeParse(current);
  return (
    parsed.success && JSON.stringify(parsed.data) === JSON.stringify(saved)
  );
}

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
    if (initialNextInvoiceNumber)
      invoice.invoiceNumber = initialNextInvoiceNumber;
    return invoice;
  }, [initialNextInvoiceNumber]);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isExporting, setIsExporting] = useState(false);
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [selectedClientId, setSelectedClientId] = useState("");
  const clientSelectionVersion = useRef(0);
  const [databaseMessage, setDatabaseMessage] = useState(
    initialDataError ? "Some database data is temporarily unavailable." : "",
  );
  const [savedInvoices, setSavedInvoices] =
    useState<SavedInvoiceRecord[]>(initialSavedInvoices);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [nextInvoiceNumber, setNextInvoiceNumber] = useState(
    initialInvoice.invoiceNumber,
  );
  const [savedProfile, setSavedProfile] = useState<Profile | null>(
    initialProfile,
  );
  const form = useForm<Invoice>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: initialInvoice,
    mode: "onBlur",
  });
  const currentInvoiceId = useWatch({ control: form.control, name: "id" });
  // Subscribe to dirty state so navigation checks reflect the current form.
  const { isDirty } = form.formState;
  const hasUnsavedChanges = () => {
    const current = form.getValues();
    const saved = savedInvoices.find(
      (record) => record.invoice.id === current.id,
    );
    return saved
      ? !matchesSavedInvoice(current, saved.invoice)
      : isDirty || readInvoiceRecovery(userEmail)?.invoice.id === current.id;
  };
  const confirmDiscard = () =>
    !hasUnsavedChanges() ||
    window.confirm("Discard unsaved changes to this invoice?");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const recovery = readInvoiceRecovery(userEmail);
      if (recovery) {
        form.reset(recovery.invoice);
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
  }, [form, initialProfile, userEmail]);

  const newInvoice = (invoiceNumber = nextInvoiceNumber) => {
    if (!confirmDiscard()) return;
    clientSelectionVersion.current += 1;
    clearInvoiceRecovery(userEmail);
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
    setSaveState("idle");
    setDatabaseMessage(`New invoice ${invoiceNumber} is ready.`);
  };

  const exportPdf = form.handleSubmit(async (validInvoice) => {
    setIsExporting(true);
    try {
      await downloadInvoicePdf(validInvoice);
    } catch {
      setDatabaseMessage("Could not export the invoice. Please try again.");
    } finally {
      setIsExporting(false);
    }
  });

  const fetchNextNumber = async (): Promise<string | null> => {
    try {
      const response = await fetch("/api/invoices/next-number");
      if (!response.ok) return null;
      const payload = await readJsonResponse(response);
      const number = (payload as { invoiceNumber?: unknown } | null)
        ?.invoiceNumber;
      if (typeof number !== "string") return null;
      setNextInvoiceNumber(number);
      return number;
    } catch {
      return null;
    }
  };

  const runDatabaseAction = async (action: () => Promise<void>) => {
    try {
      await action();
    } catch {
      setDatabaseMessage(
        "Could not complete the request. Check your connection and try again.",
      );
    }
  };

  const saveInvoiceToDatabase = form.handleSubmit(async (validInvoice) => {
    setIsSavingInvoice(true);
    try {
      const response = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(validInvoice),
      });
      const payload = await readJsonResponse(response);
      const result = savedInvoiceRecordSchema.safeParse(
        (payload as { invoice?: unknown } | null)?.invoice,
      );
      if (!response.ok || !result.success) {
        const error = (payload as { error?: unknown } | null)?.error;
        setDatabaseMessage(
          typeof error === "string" ? error : "Could not save the invoice.",
        );
        return;
      }
      const saved = result.data;
      setSavedInvoices((current) => [
        saved,
        ...current.filter((record) => record.invoice.id !== saved.invoice.id),
      ]);
      if (matchesSavedInvoice(form.getValues(), validInvoice)) {
        clearInvoiceRecovery(userEmail);
        form.reset(saved.invoice);
        setSaveState("idle");
      }
      await fetchNextNumber();
      setDatabaseMessage(
        `${saved.invoice.invoiceNumber} saved as ${invoiceStatusLabels[saved.status]}.`,
      );
    } catch {
      setDatabaseMessage(
        "Could not save the invoice. Check your connection and try again.",
      );
    } finally {
      setIsSavingInvoice(false);
    }
  });

  const loadSavedInvoice = (record: SavedInvoiceRecord) => {
    if (!confirmDiscard()) return;
    clientSelectionVersion.current += 1;
    clearInvoiceRecovery(userEmail);
    form.reset(record.invoice);
    setSelectedClientId("");
    setSaveState("idle");
    setDatabaseMessage(
      `${record.invoice.invoiceNumber} loaded (${invoiceStatusLabels[record.status]}).`,
    );
  };

  const changeInvoiceStatus = async (
    record: SavedInvoiceRecord,
    status: InvoiceStatus,
  ) =>
    runDatabaseAction(async () => {
      if (
        status === "sent" &&
        form.getValues("id") === record.invoice.id &&
        hasUnsavedChanges()
      ) {
        setDatabaseMessage(
          "Save your changes before marking this invoice Sent.",
        );
        return;
      }
      const response = await fetch(`/api/invoices/${record.invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await readJsonResponse(response);
      const result = savedInvoiceRecordSchema.safeParse(
        (payload as { invoice?: unknown } | null)?.invoice,
      );
      if (!response.ok || !result.success) {
        setDatabaseMessage("Could not update invoice status.");
        return;
      }
      const updated = result.data;
      setSavedInvoices((current) =>
        current.map((candidate) =>
          candidate.invoice.id === updated.invoice.id ? updated : candidate,
        ),
      );

      if (status === "sent") {
        const followingNumber = await fetchNextNumber();
        if (
          followingNumber &&
          form.getValues("id") === updated.invoice.id &&
          !hasUnsavedChanges()
        ) {
          newInvoice(followingNumber);
          setDatabaseMessage(
            `${updated.invoice.invoiceNumber} marked Sent. ${followingNumber} is ready.`,
          );
          return;
        }
      }
      setDatabaseMessage(
        `${updated.invoice.invoiceNumber} marked ${invoiceStatusLabels[status]}.`,
      );
    });

  const deleteSavedInvoice = async (record: SavedInvoiceRecord) =>
    runDatabaseAction(async () => {
      const response = await fetch(`/api/invoices/${record.invoice.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setDatabaseMessage("Could not delete the invoice.");
        return;
      }
      setSavedInvoices((current) =>
        current.filter(
          (candidate) => candidate.invoice.id !== record.invoice.id,
        ),
      );
      const followingNumber = await fetchNextNumber();
      if (form.getValues("id") === record.invoice.id)
        newInvoice(followingNumber ?? nextInvoiceNumber);
      setDatabaseMessage(`${record.invoice.invoiceNumber} deleted.`);
    });

  const saveProfileDetails = async () =>
    runDatabaseAction(async () => {
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
      const payload = await readJsonResponse(response);
      const result = profileSchema.safeParse(
        (payload as { profile?: unknown } | null)?.profile,
      );
      if (response.ok && result.success) {
        setSavedProfile(result.data);
        setDatabaseMessage("Your details were saved to the database.");
      } else {
        setDatabaseMessage("Could not save your details.");
      }
    });

  const chooseClient = (id: string) => {
    clientSelectionVersion.current += 1;
    setSelectedClientId(id);
    const client = clients.find((candidate) => candidate.id === id);
    if (!client) return;
    form.setValue(
      "client",
      {
        name: client.name,
        email: client.email,
        address: client.address,
        vatNumber: client.vatNumber,
      },
      { shouldDirty: true },
    );
    setDatabaseMessage(`${client.name} loaded.`);
  };

  const saveCurrentClient = async () =>
    runDatabaseAction(async () => {
      const valid = await form.trigger("client");
      if (!valid) {
        setDatabaseMessage("Complete the client details before saving.");
        return;
      }
      const selectionVersion = clientSelectionVersion.current;
      let response: Response;
      try {
        response = await fetch("/api/clients", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: selectedClientId || undefined,
            ...form.getValues("client"),
          }),
        });
      } catch {
        setDatabaseMessage("Could not reach the database.");
        return;
      }
      const payload = await readJsonResponse(response);
      const result = clientRecordSchema.safeParse(
        payload && typeof payload === "object"
          ? (payload as { client?: unknown }).client
          : undefined,
      );
      if (!response.ok || !result.success) {
        setDatabaseMessage("Could not save the client.");
        return;
      }
      const saved = result.data;
      setClients((current) =>
        [...current.filter((client) => client.id !== saved.id), saved].sort(
          (a, b) => a.name.localeCompare(b.name),
        ),
      );
      if (clientSelectionVersion.current === selectionVersion) {
        setSelectedClientId(saved.id);
        setDatabaseMessage(`${saved.name} was saved to the database.`);
      }
    });

  const deleteCurrentClient = async () =>
    runDatabaseAction(async () => {
      if (!selectedClientId) return;
      const response = await fetch(`/api/clients/${selectedClientId}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        setDatabaseMessage("Could not delete the client.");
        return;
      }
      setClients((current) =>
        current.filter((client) => client.id !== selectedClientId),
      );
      setSelectedClientId("");
      setDatabaseMessage("Client deleted.");
    });

  const currentSavedInvoice = savedInvoices.find(
    (record) => record.invoice.id === currentInvoiceId,
  );

  return (
    <FormProvider {...form}>
      <RecoveryAutosave userKey={userEmail} onSaveStateChange={setSaveState} />
      <main className="app-shell">
        <AppHeader
          userEmail={userEmail}
          saveState={saveState}
          savedInvoices={savedInvoices}
          isSavingInvoice={isSavingInvoice}
          isExporting={isExporting}
          onNewInvoice={() => newInvoice()}
          onLoadSavedInvoice={loadSavedInvoice}
          onChangeInvoiceStatus={changeInvoiceStatus}
          onDeleteSavedInvoice={deleteSavedInvoice}
          onSave={saveInvoiceToDatabase}
          onExport={exportPdf}
          onSignOut={() => clearInvoiceRecovery(userEmail)}
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
              <p>
                Fill in the details. Unsaved changes are backed up in this
                browser.
              </p>
              <p className="database-message" aria-live="polite">
                {databaseMessage}
              </p>
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
