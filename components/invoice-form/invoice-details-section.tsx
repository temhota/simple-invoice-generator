import { useFormContext } from "react-hook-form";
import { FieldError } from "@/components/invoice-form/field-error";
import type { Invoice } from "@/lib/invoice";

export function InvoiceDetailsSection() {
  const { register, formState: { errors } } = useFormContext<Invoice>();

  return (
    <fieldset className="form-card">
      <legend>Invoice details</legend>
      <div className="form-grid invoice-details-grid">
        <label>
          <span>Invoice number</span>
          <input {...register("invoiceNumber")} aria-invalid={Boolean(errors.invoiceNumber)} />
          <FieldError message={errors.invoiceNumber?.message} />
        </label>
        <label>
          <span>Work start</span>
          <input type="date" {...register("workStartDate")} aria-invalid={Boolean(errors.workStartDate)} />
          <FieldError message={errors.workStartDate?.message} />
        </label>
        <label>
          <span>Work end</span>
          <input type="date" {...register("workEndDate")} aria-invalid={Boolean(errors.workEndDate)} />
          <FieldError message={errors.workEndDate?.message} />
        </label>
        <label>
          <span>Due date</span>
          <input type="date" {...register("dueDate")} aria-invalid={Boolean(errors.dueDate)} />
          <FieldError message={errors.dueDate?.message} />
        </label>
      </div>
    </fieldset>
  );
}
