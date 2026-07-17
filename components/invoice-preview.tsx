import { calculateInvoiceTotals, calculateLineTotalCents, formatMoney, type Invoice } from "@/lib/invoice";

type InvoicePreviewProps = { invoice: Invoice };

const show = (value: string, fallback: string) => value.trim() || fallback;

export function InvoicePreview({ invoice }: InvoicePreviewProps) {
  const totals = calculateInvoiceTotals(invoice.items, invoice.taxRateBps);

  return (
    <article className="invoice-paper" aria-label="Invoice preview">
      <header className="preview-header">
        <div>
          <p className="eyebrow">Invoice</p>
          <h2>{show(invoice.invoiceNumber, "INV-000")}</h2>
        </div>
        <div className="preview-dates">
          <span>Period <strong>{invoice.workStartDate || "—"} – {invoice.workEndDate || "—"}</strong></span>
          <span>Due <strong>{invoice.dueDate || "—"}</strong></span>
        </div>
      </header>

      <div className="party-grid">
        <section>
          <p className="preview-label">From</p>
          <h3>{show(invoice.issuer.name, "Your business")}</h3>
          <p>{show(invoice.issuer.address, "Business address")}</p>
          {invoice.issuer.email && <p>{invoice.issuer.email}</p>}
          {invoice.issuer.taxNumber && <p>Tax no. {invoice.issuer.taxNumber}</p>}
          {invoice.issuer.vatNumber && <p>VAT no. {invoice.issuer.vatNumber}</p>}
        </section>
        <section>
          <p className="preview-label">Bill to</p>
          <h3>{show(invoice.client.name, "Client name")}</h3>
          <p>{show(invoice.client.address, "Client address")}</p>
          {invoice.client.email && <p>{invoice.client.email}</p>}
          {invoice.client.vatNumber && <p>VAT no. {invoice.client.vatNumber}</p>}
        </section>
      </div>

      <div className="preview-table-wrap">
        <table className="preview-table">
          <thead>
            <tr><th>Description</th><th>Hours</th><th>Rate</th><th>Amount</th></tr>
          </thead>
          <tbody>
            {invoice.items.map((item) => (
              <tr key={item.id}>
                <td>{show(item.description, "Line item")}</td>
                <td>{item.hours}</td>
                <td>{formatMoney(item.unitPriceCents, invoice.currency)}</td>
                <td>{formatMoney(calculateLineTotalCents(item.hours, item.unitPriceCents), invoice.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="totals" aria-label="Invoice totals">
        <div><span>Subtotal</span><strong>{formatMoney(totals.subtotalCents, invoice.currency)}</strong></div>
        <div><span>VAT ({invoice.taxRateBps / 100}%)</span><strong>{formatMoney(totals.taxCents, invoice.currency)}</strong></div>
        <div className="grand-total"><span>Total</span><strong>{formatMoney(totals.totalCents, invoice.currency)}</strong></div>
      </div>

      <div className="preview-footer">
        <section className="preview-banking">
          <p className="preview-label">Banking information</p>
          <p><strong>{show(invoice.banking.accountName, "Account name")}</strong></p>
          <p>IBAN {show(invoice.banking.iban, "—")}</p>
          <p>BIC {show(invoice.banking.bic, "—")}</p>
        </section>
        {invoice.notes && (
          <section className="preview-notes">
            <p className="preview-label">Notes</p>
            <p>{invoice.notes}</p>
          </section>
        )}
      </div>
      {invoice.reverseCharge && (
        <p className="reverse-charge-note">Reverse Charge - art. 196 VAT Directive 2006/112/CE</p>
      )}
    </article>
  );
}
