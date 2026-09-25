import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabaseClient";
import { requireCompany } from "../organizationService";
import { normalizeDocument } from "../../utils/documentRules";
import { findLegacyImagePath } from "./legacyImagePath";
async function scope() {
  const company = requireCompany(); // Capture before the first await.
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user || company.accountant_id !== user.id)
    throw new Error("Sesión o empresa inválida");
  return { userId: user.id, companyId: company.id };
}
const check = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const fields = new Set([
  ...Object.keys(normalizeDocument({})),
  "taxStatus",
  "status",
  "imagePath",
  "source_job_id",
  "source_index",
  "extracted_original",
]);
const pick = (data) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => fields.has(k)));
const supabaseProvider = {
  async initialize() {
    if (!supabase) throw new Error("Falta configurar Supabase");
  },
  async getAll() {
    const { companyId } = await scope();
    const rows = [];
    for (let from = 0; ; from += 500) {
      const batch = check(
        await supabase
          .from("invoices")
          .select("*")
          .eq("organization_id", companyId)
          .eq("deleted", false)
          .order("date", { ascending: false })
          .order("id")
          .range(from, from + 499),
      );
      rows.push(...batch);
      if (batch.length < 500) return rows;
    }
  },
  async getById(id) {
    const { companyId } = await scope();
    return check(
      await supabase
        .from("invoices")
        .select("*")
        .eq("organization_id", companyId)
        .eq("id", id)
        .maybeSingle(),
    );
  },
  async save(invoiceData) {
    const { userId, companyId } = await scope();
    // Result identifiers make retries safe even when the response is lost.
    if (invoiceData.source_job_id != null) {
      const found = check(
        await supabase
          .from("invoices")
          .select("*")
          .eq("organization_id", companyId)
          .eq("source_job_id", invoiceData.source_job_id)
          .eq("source_index", invoiceData.source_index)
          .maybeSingle(),
      );
      if (found) return found;
    }
    const now = new Date().toISOString();
    const invoice = {
      ...pick(invoiceData),
      id: uuidv4(),
      user_id: userId,
      organization_id: companyId,
      createdAt: now,
      updatedAt: now,
      taxStatus: "reviewed",
      reviewed_at: now,
      deleted: false,
    };
    return check(
      await supabase.from("invoices").insert(invoice).select().single(),
    );
  },
  async update(id, updates) {
    const { companyId } = await scope();
    const allowed = pick(updates);
    delete allowed.source_job_id;
    delete allowed.source_index;
    delete allowed.extracted_original;
    delete allowed.imagePath;
    return check(
      await supabase
        .from("invoices")
        .update({ ...allowed, updatedAt: new Date().toISOString() })
        .eq("organization_id", companyId)
        .eq("id", id)
        .select()
        .single(),
    );
  },
  async delete(id) {
    const { companyId } = await scope();
    // Retain originals and the audit trail; this is a soft deletion.
    check(
      await supabase
        .from("invoices")
        .update({ deleted: true })
        .eq("organization_id", companyId)
        .eq("id", id)
        .select()
        .single(),
    );
  },
  async saveImage() {
    throw new Error("Carga el original antes de guardar el comprobante.");
  },
  async getImage(id) {
    const invoice = await this.getById(id);
    if (!invoice) return null;
    if (invoice.source_job_id && invoice.imagePath)
      return check(
        await supabase.storage.from("documents").download(invoice.imagePath),
      );
    const userId = invoice.user_id;
    let path = invoice.imagePath;
    if (!path) path = await findLegacyImagePath(supabase.storage, userId, id);
    return path
      ? check(await supabase.storage.from("images").download(path))
      : null;
  },
  async deleteImage() {
    throw new Error(
      "Los originales se conservan para mantener la trazabilidad.",
    );
  },
  async getSetting(key) {
    const { companyId } = await scope();
    const row = check(
      await supabase
        .from("company_settings")
        .select("value")
        .eq("organization_id", companyId)
        .eq("key", key)
        .maybeSingle(),
    );
    return row?.value ?? null;
  },
  async saveSetting(key, value) {
    const { companyId } = await scope();
    check(
      await supabase
        .from("company_settings")
        .upsert({ organization_id: companyId, key, value }),
    );
  },
  async clearAll() {
    const { companyId } = await scope();
    check(
      await supabase
        .from("invoices")
        .update({ deleted: true })
        .eq("organization_id", companyId),
    );
  },
  async importInvoice(invoice) {
    return this.save(invoice);
  },
};
export default supabaseProvider;
