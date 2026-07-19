import { useEffect } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { saveDraft, type SavedDraft } from "@/lib/drafts";
import type { Invoice } from "@/lib/invoice";

type DraftAutosaveProps = {
  onDraftsChange: (drafts: SavedDraft[]) => void;
  onSaveStateChange: (state: "saving" | "saved") => void;
};

export function DraftAutosave({ onDraftsChange, onSaveStateChange }: DraftAutosaveProps) {
  const { control } = useFormContext<Invoice>();
  const invoice = useWatch({ control }) as Invoice;

  useEffect(() => {
    if (!invoice?.id) return;
    const savingTimeout = window.setTimeout(() => onSaveStateChange("saving"), 0);
    const saveTimeout = window.setTimeout(() => {
      onDraftsChange(saveDraft(invoice));
      onSaveStateChange("saved");
    }, 500);
    return () => {
      window.clearTimeout(savingTimeout);
      window.clearTimeout(saveTimeout);
    };
  }, [invoice, onDraftsChange, onSaveStateChange]);

  return null;
}
