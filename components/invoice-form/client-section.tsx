import { useFormContext } from "react-hook-form";
import { FieldError } from "@/components/invoice-form/field-error";
import type { ClientRecord } from "@/lib/contacts";
import type { Invoice } from "@/lib/invoice";

type ClientSectionProps = {
  clients: ClientRecord[];
  selectedClientId: string;
  onSelect: (id: string) => void;
  onSave: () => void;
  onDelete: () => void;
};

export function ClientSection({
  clients,
  selectedClientId,
  onSelect,
  onSave,
  onDelete,
}: ClientSectionProps) {
  const { register, formState: { errors } } = useFormContext<Invoice>();

  return (
    <fieldset className="form-card">
      <legend>Bill to</legend>
      <div className="stack">
        <div className="saved-client-controls">
          <label>
            <span>Saved clients</span>
            <select value={selectedClientId} onChange={(event) => onSelect(event.target.value)}>
              <option value="">New client</option>
              {clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}
            </select>
          </label>
          <button className="button secondary delete-client-button" type="button" onClick={onDelete} disabled={!selectedClientId}>Delete</button>
        </div>
        <label>
          <span>Client name</span>
          <input placeholder="Northstar GmbH" {...register("client.name")} aria-invalid={Boolean(errors.client?.name)} />
          <FieldError message={errors.client?.name?.message} />
        </label>
        <label>
          <span>Email <small>Optional</small></span>
          <input type="email" placeholder="hello@example.com" {...register("client.email")} aria-invalid={Boolean(errors.client?.email)} />
          <FieldError message={errors.client?.email?.message} />
        </label>
        <label>
          <span>Address</span>
          <textarea rows={3} placeholder="Street, city, country" {...register("client.address")} aria-invalid={Boolean(errors.client?.address)} />
          <FieldError message={errors.client?.address?.message} />
        </label>
        <label>
          <span>VAT number <small>Optional</small></span>
          <input placeholder="VAT ID" {...register("client.vatNumber")} aria-invalid={Boolean(errors.client?.vatNumber)} />
          <FieldError message={errors.client?.vatNumber?.message} />
        </label>
        <button className="button secondary database-save-button" type="button" onClick={onSave}>
          {selectedClientId ? "Update client" : "Save client"}
        </button>
      </div>
    </fieldset>
  );
}
