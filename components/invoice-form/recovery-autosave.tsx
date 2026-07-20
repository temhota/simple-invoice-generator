import { useEffect } from "react";
import { useFormContext, useFormState, useWatch } from "react-hook-form";
import { saveInvoiceRecovery } from "@/lib/invoice-recovery";
import type { Invoice } from "@/lib/invoice";

type RecoveryAutosaveProps = {
  userKey: string;
  onSaveStateChange: (state: "saving" | "saved") => void;
};

export function RecoveryAutosave({ userKey, onSaveStateChange }: RecoveryAutosaveProps) {
  const { control } = useFormContext<Invoice>();
  const invoice = useWatch({ control }) as Invoice;
  const { isDirty } = useFormState({ control });

  useEffect(() => {
    if (!invoice?.id || !isDirty) return;
    const savingTimeout = window.setTimeout(() => onSaveStateChange("saving"), 0);
    const saveTimeout = window.setTimeout(() => {
      saveInvoiceRecovery(userKey, invoice);
      onSaveStateChange("saved");
    }, 500);
    return () => {
      window.clearTimeout(savingTimeout);
      window.clearTimeout(saveTimeout);
    };
  }, [invoice, isDirty, onSaveStateChange, userKey]);

  return null;
}
