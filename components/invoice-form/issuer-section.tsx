import { useFormContext } from "react-hook-form";
import { FieldError } from "@/components/invoice-form/field-error";
import type { Invoice } from "@/lib/invoice";

type IssuerSectionProps = {
  onSave: () => void;
};

export function IssuerSection({ onSave }: IssuerSectionProps) {
  const { register, formState: { errors } } = useFormContext<Invoice>();

  return (
    <fieldset className="form-card">
      <legend>From</legend>
      <div className="stack">
        <label>
          <span>Business name</span>
          <input placeholder="Acme Studio" {...register("issuer.name")} aria-invalid={Boolean(errors.issuer?.name)} />
          <FieldError message={errors.issuer?.name?.message} />
        </label>
        <label>
          <span>Email <small>Optional</small></span>
          <input type="email" placeholder="hello@example.com" {...register("issuer.email")} aria-invalid={Boolean(errors.issuer?.email)} />
          <FieldError message={errors.issuer?.email?.message} />
        </label>
        <label>
          <span>Address</span>
          <textarea rows={3} placeholder="Street, city, country" {...register("issuer.address")} aria-invalid={Boolean(errors.issuer?.address)} />
          <FieldError message={errors.issuer?.address?.message} />
        </label>
        <div className="form-grid two-cols">
          <label>
            <span>Tax number <small>Optional</small></span>
            <input placeholder="Tax ID" {...register("issuer.taxNumber")} aria-invalid={Boolean(errors.issuer?.taxNumber)} />
            <FieldError message={errors.issuer?.taxNumber?.message} />
          </label>
          <label>
            <span>VAT number <small>Optional</small></span>
            <input placeholder="VAT ID" {...register("issuer.vatNumber")} aria-invalid={Boolean(errors.issuer?.vatNumber)} />
            <FieldError message={errors.issuer?.vatNumber?.message} />
          </label>
        </div>
        <button className="button secondary database-save-button" type="button" onClick={onSave}>Save my details</button>
      </div>
    </fieldset>
  );
}
