import { create } from "zustand";
import {
  requireCompany,
  getWorkspaceGeneration,
} from "../services/organizationService";
import {
  listJobs,
  uploadDocument,
  patchReview,
  documentRequest,
} from "../services/jobService";
import { supabase } from "../services/supabaseClient";
import { documentKey } from "../utils/documentRules";
import useInvoiceStore from "./invoiceStore";
let epoch = 0;
const previews = new Map();
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
    previews.clear();
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
  async hydrate() {
    const company = requireCompany(),
      version = epoch,
      generation = getWorkspaceGeneration();
    try {
      const jobs = await listJobs(company.id);
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
        useInvoiceStore.getState().invoices.map(documentKey).filter(Boolean),
      );
      const queue = [];
      for (const j of jobs) {
        const cached = previews.get(j.id);
        let url = cached?.expires > Date.now() ? cached.url : null;
        if (!url && j.status === "ready") {
          const signed = await supabase.storage
            .from("documents")
            .createSignedUrl(j.object_path, 3600);
          if (!signed.error) {
            url = signed.data.signedUrl;
            previews.set(j.id, { url, expires: Date.now() + 3300_000 });
          }
        }
        const base = {
          jobId: j.id,
          name: j.filename,
          size: Number(j.file_bytes),
          mimeType: j.mime_type,
          tempPreviewUrl: url,
          file: null,
          serverStatus: j.status,
        };
        if (j.status === "ready") {
          (j.result?.documents || []).forEach((data, index) => {
            const id = j.id + ":" + index;
            if (saved.has(id) || j.review?.[index]?._dismissed) return;
            const review =
              pendingReviews.get(id)?.patch || j.review?.[index] || {};
            const original = {
              ...data,
              imagePath: j.object_path,
              source_job_id: j.id,
              source_index: index,
              extracted_original: data,
            };
            queue.push({
              ...base,
              id,
              index,
              status: "done",
              extractedData: original,
              review,
              isDuplicate: invoiceKeys.has(documentKey({ ...data, ...review })),
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
    for (const file of files) {
      if (version !== epoch) break;
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
