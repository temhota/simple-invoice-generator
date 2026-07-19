import { Controller, useFormContext, useWatch } from "react-hook-form";
import { FieldError } from "@/components/invoice-form/field-error";
import { currencies, type Invoice } from "@/lib/invoice";

export function PaymentSection() {
  const { control, register, setValue, formState: { errors } } = useFormContext<Invoice>();
  const reverseCharge = useWatch({ control, name: "reverseCharge" });

  return (
    <fieldset className="form-card">
      <legend>Payment details</legend>
      <div className="form-grid payment-grid">
        <label>
          <span>Currency</span>
          <select {...register("currency")}>
            {currencies.map((currency) => <option value={currency} key={currency}>{currency}</option>)}
          </select>
        </label>
        <label>
          <span>VAT rate (%)</span>
          <Controller control={control} name="taxRateBps" render={({ field }) => (
            <select disabled={reverseCharge} value={field.value} onChange={(event) => field.onChange(Number(event.target.value))} onBlur={field.onBlur}>
              <option value={0}>0%</option>
              <option value={1900}>19%</option>
            </select>
          )} />
        </label>
        <label className="reverse-charge-field">
          <Controller control={control} name="reverseCharge" render={({ field }) => (
            <span className="checkbox-control">
              <input
                type="checkbox"
                checked={field.value}
                onChange={(event) => {
                  field.onChange(event.target.checked);
                  if (event.target.checked) setValue("taxRateBps", 0, { shouldValidate: true, shouldDirty: true });
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
          <textarea rows={3} placeholder="Payment terms or a thank-you note" {...register("notes")} />
          <FieldError message={errors.notes?.message} />
        </label>
      </div>
    </fieldset>
  );
}
