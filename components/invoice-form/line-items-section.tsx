import { useState } from "react";
import { Controller, useFieldArray, useFormContext, useWatch } from "react-hook-form";
import { CurrencyField } from "@/components/currency-field";
import { DescriptionImprovementDialog } from "@/components/description-improvement-dialog";
import { FieldError } from "@/components/invoice-form/field-error";
import {
  descriptionImprovementRequestSchema,
  descriptionImprovementSchema,
  type DescriptionImprovement,
} from "@/lib/ai-description";
import { readJsonResponse } from "@/lib/api-response";
import { makeId, type Invoice } from "@/lib/invoice";

type DescriptionSuggestion = {
  itemId: string;
  original: string;
  improvement: DescriptionImprovement;
};

export function LineItemsSection() {
  const form = useFormContext<Invoice>();
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "items" });
  const items = useWatch({ control: form.control, name: "items" });
  const [improvingItemId, setImprovingItemId] = useState<string | null>(null);
  const [descriptionSuggestion, setDescriptionSuggestion] = useState<DescriptionSuggestion | null>(null);
  const [descriptionAiError, setDescriptionAiError] = useState<{ itemId: string; message: string } | null>(null);

  const improveItemDescription = async (index: number) => {
    const item = form.getValues(`items.${index}`);
    const input = descriptionImprovementRequestSchema.safeParse({ description: item.description });
    if (!input.success) {
      form.setError(`items.${index}.description`, { message: input.error.issues[0]?.message });
      return;
    }

    const original = input.data.description;
    setImprovingItemId(item.id);
    setDescriptionAiError(null);
    form.clearErrors(`items.${index}.description`);

    try {
      const response = await fetch("/api/ai/improve-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: original }),
      });
      const payload = await readJsonResponse(response);
      const result = descriptionImprovementSchema.safeParse(
        (payload as { improvement?: unknown } | null)?.improvement,
      );

      if (!response.ok || !result.success) {
        const error = (payload as { error?: unknown } | null)?.error;
        setDescriptionAiError({
          itemId: item.id,
          message: typeof error === "string" ? error : "Could not improve this description.",
        });
        return;
      }

      const currentItem = form.getValues("items").find((candidate) => candidate.id === item.id);
      if (!currentItem || currentItem.description.trim() !== original) {
        setDescriptionAiError({ itemId: item.id, message: "The description changed. Request a new suggestion." });
        return;
      }

      setDescriptionSuggestion({ itemId: item.id, original, improvement: result.data });
    } catch {
      setDescriptionAiError({ itemId: item.id, message: "AI suggestion is temporarily unavailable." });
    } finally {
      setImprovingItemId(null);
    }
  };

  const acceptDescriptionSuggestion = () => {
    if (!descriptionSuggestion) return;
    const itemIndex = form.getValues("items").findIndex((item) => item.id === descriptionSuggestion.itemId);
    if (itemIndex >= 0) {
      form.setValue(`items.${itemIndex}.description`, descriptionSuggestion.improvement.suggestion, {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
    setDescriptionSuggestion(null);
  };

  return (
    <>
      <fieldset className="form-card items-card">
        <legend className="sr-only">Line items</legend>
        <div className="legend-row">
          <span>Line items</span>
          <button className="text-button" type="button" onClick={() => append({ id: makeId(), description: "", hours: 1, unitPriceCents: 0 })}>+ Add item</button>
        </div>
        <div className="items-list">
          {fields.map((field, index) => {
            const itemId = items[index]?.id;
            return (
              <div className="item-row" key={field.id}>
                <div className="item-description">
                  <div className="item-description-heading">
                    <label htmlFor={`item-description-${field.id}`}>Description</label>
                    <button
                      className="ai-improve-button"
                      type="button"
                      onClick={() => improveItemDescription(index)}
                      disabled={improvingItemId !== null}
                    >
                      {improvingItemId === itemId ? "Improving…" : "✦ Improve with AI"}
                    </button>
                  </div>
                  <input id={`item-description-${field.id}`} placeholder="Website design" {...form.register(`items.${index}.description`)} aria-invalid={Boolean(form.formState.errors.items?.[index]?.description)} />
                  <FieldError message={form.formState.errors.items?.[index]?.description?.message} />
                  {descriptionAiError?.itemId === itemId && (
                    <p className="field-error" role="alert">{descriptionAiError.message}</p>
                  )}
                </div>
                <label>
                  <span>Hours</span>
                  <input type="number" min="0.25" max="9999" step="0.25" {...form.register(`items.${index}.hours`, { valueAsNumber: true })} aria-invalid={Boolean(form.formState.errors.items?.[index]?.hours)} />
                  <FieldError message={form.formState.errors.items?.[index]?.hours?.message} />
                </label>
                <label>
                  <span>Hourly rate</span>
                  <Controller control={form.control} name={`items.${index}.unitPriceCents`} render={({ field: priceField }) => (
                    <CurrencyField value={priceField.value} onChange={priceField.onChange} onBlur={priceField.onBlur} aria-invalid={Boolean(form.formState.errors.items?.[index]?.unitPriceCents)} />
                  )} />
                  <FieldError message={form.formState.errors.items?.[index]?.unitPriceCents?.message} />
                </label>
                <button className="remove-button" type="button" onClick={() => remove(index)} disabled={fields.length === 1} aria-label={`Remove item ${index + 1}`}>×</button>
              </div>
            );
          })}
        </div>
        <FieldError message={form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message} />
      </fieldset>

      {descriptionSuggestion && (
        <DescriptionImprovementDialog
          original={descriptionSuggestion.original}
          improvement={descriptionSuggestion.improvement}
          onAccept={acceptDescriptionSuggestion}
          onClose={() => setDescriptionSuggestion(null)}
        />
      )}
    </>
  );
}
