import { create } from "zustand";
import {
  requireCompany,
  getWorkspaceGeneration,
} from "../services/organizationService";
import {
  listJobs,
  listInvoiceKeys,
  uploadDocument,
  patchReview,
  documentRequest,
  fetchDocumentPreview,
} from "../services/jobService";
import { supabase } from "../services/supabaseClient";
import { documentKey, normalizeDocumentType, withVoucherFolio } from "../utils/documentRules";
import useInvoiceStore from "./invoiceStore";
let epoch = 0;
let prefetchVersion = 0;
const previews = new Map();
const originals = new Map();
const previewRequests = new Map();
const pendingReviews = new Map();
const useUploadQueueStore = create((set, get) => ({
  queue: [],
  isProcessing: false,
  isHydrated: false,
  lastBatchSummary: null,
  error: null,
  uploadProgress: null,
  reset() {
    epoch++;
    prefetchVersion++;
    for (const entry of previews.values()) if (entry.objectUrl) URL.revokeObjectURL(entry.url);
    previews.clear();
    originals.clear();
    previewRequests.clear();
    pendingReviews.clear();
    set({
      queue: [],
      isProcessing: false,
      isHydrated: false,
      lastBatchSummary: null,
      error: null,
      uploadProgress: null,
    });
  },
  async ensureOriginal(jobId) {
    const item = get().queue.find((row) => row.jobId === jobId);
    if (!item) return null;
    const cached = originals.get(jobId);
    if (cached?.expires > Date.now()) return cached.url;
    const version = epoch;
    const signed = await supabase.storage.from("documents").createSignedUrl(item.objectPath, 3600);
    if (signed.error) throw signed.error;
    if (version !== epoch) return null;
    originals.set(jobId, { url: signed.data.signedUrl, expires: Date.now() + 3_300_000 });
    return signed.data.signedUrl;
  },
  async ensurePreview(jobId) {
    const cached = previews.get(jobId);
    if (cached && (cached.objectUrl || cached.expires > Date.now())) {
      previews.delete(jobId);
      previews.set(jobId, cached);
      return cached.url;
    }
    if (previewRequests.has(jobId)) return previewRequests.get(jobId);
    const item = get().queue.find((row) => row.jobId === jobId);
    if (!item) return null;
    const version = epoch;
    const request = (async () => {
      let url, objectUrl = false;
      if (item.mimeType?.startsWith("image/")) {
          const blob = await fetchDocumentPreview(jobId);
          url = URL.createObjectURL(blob);
          objectUrl = true;
          // Decode before displaying or prefetching the next document.
          const img = new Image();
          img.src = url;
          if (img.decode) await img.decode().catch(() => {});
      } else {
        url = await get().ensureOriginal(jobId);
      }
      if (!url) return null;
      if (version !== epoch) {
        if (objectUrl) URL.revokeObjectURL(url);
        return null;
      }
      previews.set(jobId, { url, objectUrl, expires: Date.now() + 3_300_000 });
      const evicted = [];
      while (previews.size > 24) {
        const oldestId = previews.keys().next().value;
        const old = previews.get(oldestId);
        if (old.objectUrl) URL.revokeObjectURL(old.url);
        previews.delete(oldestId);
        evicted.push(oldestId);
      }
      set((state) => ({ queue: state.queue.map((row) =>
        row.jobId === jobId ? { ...row, tempPreviewUrl: url }
          : evicted.includes(row.jobId) ? { ...row, tempPreviewUrl: null } : row) }));
      return url;
    })().finally(() => {
      // An old company request must not erase a new request after reset.
      if (previewRequests.get(jobId) === request) previewRequests.delete(jobId);
    });
    previewRequests.set(jobId, request);
    return request;
  },
  async prefetchPreviews(jobIds) {
    const version = ++prefetchVersion;
    const ids = [...new Set(jobIds.filter(Boolean))];
    let cursor = 0;
    const warm = async () => {
      while (version === prefetchVersion && cursor < ids.length) {
        const id = ids[cursor++];
        // Background failures leave the active image's explicit retry available.
        await get().ensurePreview(id).catch(() => {});
      }
    };
    await Promise.all([warm(), warm()]);
  },
  async hydrate() {
    const company = requireCompany(),
      version = epoch,
      generation = getWorkspaceGeneration();
    try {
      const [jobs, savedInvoices] = await Promise.all([listJobs(company.id), listInvoiceKeys(company.id)]);
      const sourceRows = [];
      // Sources include soft-deleted invoices: a saved result should never reappear.
      const readyIds = jobs
        .filter((j) => j.status === "ready")
        .map((j) => j.id);
      for (let from = 0; readyIds.length; from += 500) {
        const sources = await supabase
          .from("invoices")
          .select("source_job_id,source_index")
          .eq("organization_id", company.id)
          .in("source_job_id", readyIds)
          .range(from, from + 499);
        if (sources.error) throw sources.error;
        sourceRows.push(...sources.data);
        if (sources.data.length < 500) break;
      }
      const saved = new Set(
        sourceRows.map((s) => s.source_job_id + ":" + s.source_index),
      );
      const invoiceKeys = new Set(
        [...savedInvoices, ...useInvoiceStore.getState().invoices].map(documentKey).filter(Boolean),
      );
      const queue = [];
      for (const j of jobs) {
        const cached = previews.get(j.id);
        const url = cached && (cached.objectUrl || cached.expires > Date.now()) ? cached.url : null;
        const base = {
          jobId: j.id,
          name: j.filename,
          size: Number(j.file_bytes),
          mimeType: j.mime_type,
          tempPreviewUrl: url,
          objectPath: j.object_path,
          file: null,
          serverStatus: j.status,
        };
        if (j.status === "ready") {
          (j.result?.documents || []).forEach((data, index) => {
            const id = j.id + ":" + index;
            if (saved.has(id) || j.review?.[index]?._dismissed) return;
            const review =
              pendingReviews.get(id)?.patch || j.review?.[index] || {};
            const original = withVoucherFolio({
              ...data,
              documentType: normalizeDocumentType(data.documentType),
              imagePath: j.object_path,
              source_job_id: j.id,
              source_index: index,
              extracted_original: data,
            });
            queue.push({
              ...base,
              id,
              index,
              status: "done",
              extractedData: original,
              review,
              isDuplicate: invoiceKeys.has(documentKey(withVoucherFolio({ ...data, ...review }))),
            });
          });
        } else
          queue.push({
            ...base,
            id: j.id,
            status:
              j.status === "failed" || j.status === "uploading"
                ? "error"
                : j.status === "processing"
                  ? "processing"
                  : "waiting",
            error:
              j.status === "uploading"
                ? "Carga pendiente: reintenta para finalizar, o cancela y vuelve a subir el archivo."
                : j.error_message || j.error_code,
          });
      }
      if (version !== epoch || generation !== getWorkspaceGeneration()) return;
      if (get().isHydrated && !get().error && JSON.stringify(get().queue) === JSON.stringify(queue)) return;
      const wasProcessing = get().isProcessing;
      const processing = queue.some((q) =>
        ["pending", "processing", "waiting"].includes(q.status),
      );
      set({
        queue,
        isHydrated: true,
        isProcessing: processing,
        error: null,
        ...(wasProcessing && !processing
          ? {
              lastBatchSummary: {
                at: Date.now(),
                done: queue.filter((q) => q.status === "done").length,
                errors: queue.filter((q) => q.status === "error").length,
                duplicates: queue.filter((q) => q.isDuplicate).length,
              },
            }
          : {}),
      });
    } catch (err) {
      if (version === epoch) set({ error: err.message, isHydrated: true });
    }
  },
  async addFiles(files) {
    if (get().uploadProgress) {
      set({ error: "Espera a que termine la carga actual." });
      return 0;
    }
    const company = requireCompany(),
      version = epoch;
    set({ uploadProgress: { done: 0, total: files.length } });
    let added = 0;
    let nextFile = 0;
    const uploadNext = async () => {
      while (version === epoch && nextFile < files.length) {
        const file = files[nextFile++];
        try {
          await uploadDocument(file, company.id);
          added++;
        } catch (err) {
          if (version === epoch) set({ error: err.message });
        }
        if (version === epoch)
          set((state) => ({
            uploadProgress: {
              done: state.uploadProgress.done + 1,
              total: files.length,
            },
          }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, files.length) }, uploadNext));
    if (version === epoch) {
      set({ uploadProgress: null });
      await get().hydrate();
    }
    return added;
  },
  updateReview(id, patch) {
    const item = get().queue.find((q) => q.id === id);
    if (!item) return;
    const merged = { ...item.review, ...patch };
    set((state) => ({
      queue: state.queue.map((q) =>
        q.id === id ? { ...q, review: merged } : q,
      ),
    }));
    const previous = pendingReviews.get(id);
    const version = epoch;
    const promise = (previous?.promise || Promise.resolve())
      .catch(() => {})
      .then(() => patchReview(item.jobId, item.index, patch));
    pendingReviews.set(id, { promise, patch: merged });
    promise
      .then(() => {
        if (pendingReviews.get(id)?.promise === promise)
          pendingReviews.delete(id);
      })
      .catch(() => {
        if (version === epoch)
          set({
            error:
              "No se guardó una corrección en la nube. Mantén esta pantalla abierta y vuelve a editar el campo.",
          });
      });
  },
  async flushReviews() {
    await Promise.all([...pendingReviews.values()].map((p) => p.promise));
  },
  async removeItem(id) {
    const item = get().queue.find((q) => q.id === id);
    if (!item) return;
    try {
      if (item.status === "done")
        await patchReview(item.jobId, item.index, { _dismissed: true });
      else await documentRequest("cancel", { jobId: item.jobId });
      await get().hydrate();
    } catch (err) {
      set({ error: err.message });
    }
  },
  async removeItems(ids) {
    for (const id of ids) await get().removeItem(id);
  },
  async clearQueue() {
    for (const item of [...get().queue])
      if (item.status !== "processing") await get().removeItem(item.id);
  },
  async retryItem(id) {
    const item = get().queue.find((q) => q.id === id);
    if (!item) return;
    try {
      await documentRequest(
        item.serverStatus === "uploading" ? "enqueue" : "retry",
        { jobId: item.jobId },
      );
      await get().hydrate();
    } catch (err) {
      set({ error: err.message });
    }
  },
  async retryFailed() {
    for (const item of [...get().queue])
      if (item.status === "error") await get().retryItem(item.id);
  },
}));
export default useUploadQueueStore;
