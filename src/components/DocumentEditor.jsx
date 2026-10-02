import { useState } from "react";
import { DOCUMENT_TYPES, EXPENSE_TYPES } from "../data/expenseTypes";
import { useCompany } from "../context/CompanyContext";
import { documentErrors, AMOUNT_FIELDS, withVoucherFolio, isPaymentVoucher } from "../utils/documentRules";
import useInvoiceStore from "../store/invoiceStore";
const LABELS = {
  providerName: "Proveedor",
  providerRut: "RUT emisor",
  recipientRut: "RUT receptor",
  documentNumber: "Folio",
  date: "Fecha",
  detail: "Detalle",
  costCenter: "Centro de costo",
  referenceNumber: "Folio de referencia",
  notes: "Notas",
  netAmount: "Neto",
  exemptAmount: "Exento",
  ivaAmount: "IVA",
  specificTax: "Impuesto específico",
  otherTax: "Otros impuestos",
  withholdingAmount: "Retenciones",
  totalAmount: "Total",
  totalBoletaServicios: "Total boleta de servicios",
  totalBoletaHonorarios: "Total honorarios",
};
export default function DocumentEditor({ invoice, onClose }) {
  const { activeCompany } = useCompany();
  const [draft, setDraft] = useState(withVoucherFolio({ ...invoice })),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const set = (key, value) => setDraft((d) => withVoucherFolio({ ...d, [key]: value,
    ...(key === 'documentType' && isPaymentVoucher(d) && value !== d.documentType ? { documentNumber: null } : {}),
  }));
  const categories = activeCompany.categories?.length
    ? activeCompany.categories
    : EXPENSE_TYPES;
  return (
    <form
      className="card company-form"
      onSubmit={async (e) => {
        e.preventDefault();
        const errs = documentErrors(draft);
        if (Object.keys(errs).length) {
          setError(Object.values(errs).join(" · "));
          return;
        }
        setBusy(true);
        try {
          await useInvoiceStore.getState().updateInvoice(invoice.id, draft);
          onClose();
        } catch (err) {
          setError(err.message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Corregir comprobante</h2>
      {error && <p role="alert">{error}</p>}
      <label>
        Tipo de documento
        <select
          className="form-select"
          value={draft.documentType || ""}
          onChange={(e) => set("documentType", e.target.value)}
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <label>
        Categoría
        <select
          className="form-select"
          value={draft.expenseType || ""}
          onChange={(e) => set("expenseType", e.target.value)}
        >
          <option value="">Selecciona</option>
          {[...new Set([...categories, draft.expenseType].filter(Boolean))].map(
            (t) => (
              <option key={t}>{t}</option>
            ),
          )}
        </select>
      </label>
      {Object.entries(LABELS).map(([key, label]) => {
        const number = AMOUNT_FIELDS.includes(key);
        return (
          <label key={key}>
            {key === 'referenceNumber' && isPaymentVoucher(draft) ? 'Operación del voucher (opcional)' : label}
            <input
              className="form-input"
              type={number ? "number" : key === "date" ? "date" : "text"}
              min={number ? 0 : undefined}
              value={draft[key] ?? ""}
              readOnly={key === 'documentNumber' && isPaymentVoucher(draft)}
              onChange={(e) =>
                set(
                  key,
                  number
                    ? e.target.value === ""
                      ? null
                      : Number(e.target.value)
                    : e.target.value,
                )
              }
            />
            {key === 'documentNumber' && isPaymentVoucher(draft) && <small>Sin folio SII: se registra como 0000.</small>}
          </label>
        );
      })}
      <div className="flex gap-2">
        <button className="btn btn-primary" disabled={busy}>
          Guardar cambios
        </button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
