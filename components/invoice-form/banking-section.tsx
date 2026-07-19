import { useFormContext } from "react-hook-form";
import { FieldError } from "@/components/invoice-form/field-error";
import type { Invoice } from "@/lib/invoice";

export function BankingSection() {
  const { register, formState: { errors } } = useFormContext<Invoice>();

  return (
    <fieldset className="form-card">
      <legend>Banking information</legend>
      <div className="form-grid three-cols banking-grid">
        <label>
          <span>Name</span>
          <input placeholder="Acme Studio" {...register("banking.accountName")} aria-invalid={Boolean(errors.banking?.accountName)} />
          <FieldError message={errors.banking?.accountName?.message} />
        </label>
        <label>
          <span>IBAN</span>
          <input autoCapitalize="characters" spellCheck={false} placeholder="DE00 0000 0000 0000 0000 00" {...register("banking.iban")} aria-invalid={Boolean(errors.banking?.iban)} />
          <FieldError message={errors.banking?.iban?.message} />
        </label>
        <label>
          <span>BIC</span>
          <input autoCapitalize="characters" spellCheck={false} placeholder="ABCDEFGH" {...register("banking.bic")} aria-invalid={Boolean(errors.banking?.bic)} />
          <FieldError message={errors.banking?.bic?.message} />
        </label>
      </div>
    </fieldset>
  );
}
