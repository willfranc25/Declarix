import { v4 as uuidv4 } from "uuid";
import { supabase } from "../supabaseClient";
import { requireCompany } from "../organizationService";
import { normalizeDocument } from "../../utils/documentRules";
import { findLegacyImagePath } from "./legacyImagePath";
import { recordStorageFailure } from "../storageFailureLog";
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
const summaryColumns = [
  "id", "user_id", "organization_id", ...Object.keys(normalizeDocument({})),
  "createdAt", "updatedAt", "version", "deleted", "imagePath", "lastModifiedBy",
  "source_job_id", "source_index", "reviewed_at", "exported_at", "declared_at",
].filter((value, index, all) => all.indexOf(value) === index).join(",");
const imageExtension = (blob) => ({
  "image/jpeg": "jpeg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
})[blob.type] || "bin";
const supabaseProvider = {
  async initialize() {
    if (!supabase) throw new Error("Falta configurar Supabase");
  },
  async getAll({ includeOriginal = false } = {}) {
    const { companyId } = await scope();
    const rows = [];
    for (let from = 0; ; from += 500) {
      const batch = check(
        await supabase
          .from("invoices")
          .select(includeOriginal ? "*" : summaryColumns)
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
  async getPage({ page = 1, pageSize = 25, filters = {} } = {}) {
    const { companyId } = await scope();
    const size = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 25)));
    const number = Math.max(1, Math.floor(Number(page) || 1));
    let query = supabase.from("invoices")
      .select('id,providerName,date,documentType,expenseType,totalAmount,taxStatus,createdAt,source_job_id', { count: "exact" })
      .eq("organization_id", companyId).eq("deleted", false);
    if (filters.providerSearch?.trim()) {
      const term = filters.providerSearch.replace(/[%,()*_]/g, " ").trim();
      if (term) query = query.ilike("providerName", `%${term}%`);
    }
    if (filters.expenseType) query = query.eq("expenseType", filters.expenseType);
    if (filters.documentType) query = query.eq("documentType", filters.documentType);
    if (filters.taxStatus === "declared") query = query.eq("taxStatus", "declared");
    if (filters.taxStatus === "pending") query = query.or('taxStatus.neq.declared,taxStatus.is.null');
    if (filters.year && filters.month) {
      const month = String(filters.month).padStart(2, "0");
      const next = new Date(Date.UTC(Number(filters.year), Number(filters.month), 1)).toISOString().slice(0, 10);
      query = query.gte("date", `${filters.year}-${month}-01`)
        .lt("date", next);
    } else if (filters.year && filters.months?.length) {
      const months = [...filters.months].sort((a, b) => a - b);
      if (months.every((month, index) => index === 0 || month === months[index - 1] + 1)) {
        const next = new Date(Date.UTC(Number(filters.year), Number(months.at(-1)), 1)).toISOString().slice(0, 10);
        query = query.gte("date", `${filters.year}-${String(months[0]).padStart(2, "0")}-01`).lt("date", next);
      } else {
        const monthFilters = months.map((month) => {
          const next = new Date(Date.UTC(Number(filters.year), Number(month), 1)).toISOString().slice(0, 10);
          return `and(date.gte.${filters.year}-${String(month).padStart(2, "0")}-01,date.lt.${next})`;
        });
        query = query.or(monthFilters.join(","));
      }
    } else if (filters.year) {
      query = query.gte("date", `${filters.year}-01-01`).lt("date", `${Number(filters.year) + 1}-01-01`);
    } else if (filters.month) {
      query = query.like("date", `____-${String(filters.month).padStart(2, "0")}-%`);
    }
    const { data, error, count } = await query.order("date", { ascending: false })
      .order("id").range((number - 1) * size, number * size - 1);
    if (error) throw error;
    const jobIds = [...new Set(data.map((row) => row.source_job_id).filter(Boolean))];
    let uploadDates = new Map();
    if (jobIds.length) {
      const jobs = check(await supabase.from("extraction_jobs")
        .select("id,created_at").eq("organization_id", companyId).in("id", jobIds));
      uploadDates = new Map(jobs.map((job) => [job.id, job.created_at]));
    }
    return {
      rows: data.map((row) => ({ ...row, uploadedAt: uploadDates.get(row.source_job_id) || row.createdAt })),
      total: count || 0,
    };
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
  async saveWithImage(invoiceData, blob) {
    const { userId, companyId } = await scope();
    if (invoiceData.source_job_id)
      throw new Error("Este comprobante ya tiene un original asociado a su carga.");
    const now = new Date().toISOString();
    const id = uuidv4();
    const imagePath = `${userId}/${id}.${imageExtension(blob)}`;
    let stage = "image_upload";
    try {
      check(
        await supabase.storage.from("images").upload(imagePath, blob, {
          contentType: blob.type || "application/octet-stream",
        }),
      );
      stage = "invoice_insert";
      return check(
        await supabase
          .from("invoices")
          .insert({
            ...pick(invoiceData),
            id,
            user_id: userId,
            organization_id: companyId,
            imagePath,
            createdAt: now,
            updatedAt: now,
            taxStatus: "reviewed",
            reviewed_at: now,
            deleted: false,
          })
          .select()
          .single(),
      );
    } catch (error) {
      await recordStorageFailure({ stage, organizationId: companyId, invoiceId: id, error });
      const persisted = await supabase
        .from("invoices")
        .select("id")
        .eq("organization_id", companyId)
        .eq("id", id)
        .maybeSingle();
      if (!persisted.error && !persisted.data)
        await supabase.storage.from("images").remove([imagePath]);
      throw error;
    }
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
  async saveImage(invoiceId, blob) {
    const { userId, companyId } = await scope();
    const invoice = check(
      await supabase
        .from("invoices")
        .select("id")
        .eq("organization_id", companyId)
        .eq("id", invoiceId)
        .maybeSingle(),
    );
    if (!invoice) throw new Error("No se encontró el comprobante para adjuntar su original.");
    const path = `${userId}/${invoiceId}.${imageExtension(blob)}`;
    let stage = "image_upload";
    try {
      check(
        await supabase.storage.from("images").upload(path, blob, {
          upsert: true,
          contentType: blob.type || "application/octet-stream",
        }),
      );
      stage = "image_metadata_update";
      check(
        await supabase
          .from("invoices")
          .update({ imagePath: path, updatedAt: new Date().toISOString() })
          .eq("organization_id", companyId)
          .eq("id", invoiceId),
      );
    } catch (error) {
      await recordStorageFailure({ stage, organizationId: companyId, invoiceId, error });
      throw error;
    }
  },
  async getImage(id) {
    const invoice = await this.getById(id);
    if (!invoice) return null;
    if (invoice.source_job_id && invoice.imagePath) {
      const original = await supabase.storage.from("documents").download(invoice.imagePath);
      if (!original.error) return original.data;
    }
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
    const { userId, companyId } = await scope();
    if (!invoice?.id) throw new Error("El respaldo contiene un comprobante sin identificador.");
    const now = new Date().toISOString();
    return check(
      await supabase
        .from("invoices")
        .upsert(
          {
            ...pick(invoice),
            id: invoice.id,
            user_id: userId,
            organization_id: companyId,
            createdAt: invoice.createdAt || now,
            updatedAt: now,
            deleted: false,
          },
          { onConflict: "id" },
        )
        .select()
        .single(),
    );
  },
};
export default supabaseProvider;
