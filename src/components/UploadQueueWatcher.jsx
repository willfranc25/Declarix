import { useEffect, useRef } from 'react';
import useUploadQueueStore from '../store/uploadQueueStore';
import { useToast } from './ui/Toast';

/**
 * Observa la cola de extracción global y notifica cuando termina un lote,
 * sin importar en qué página esté el usuario. No renderiza nada.
 */
export default function UploadQueueWatcher() {
  const lastBatchSummary = useUploadQueueStore((s) => s.lastBatchSummary);
  const { addToast } = useToast();
  const lastSeenAt = useRef(null);

  useEffect(() => {
    if (!lastBatchSummary || lastBatchSummary.at === lastSeenAt.current) return;
    lastSeenAt.current = lastBatchSummary.at;

    const { done, errors, duplicates } = lastBatchSummary;
    if (done === 0 && errors === 0) return;

    const parts = [];
    if (done > 0) parts.push(`${done} lista(s) para revisar`);
    if (duplicates > 0) parts.push(`${duplicates} posible(s) duplicado(s)`);
    if (errors > 0) parts.push(`${errors} con error`);

    addToast(
      `Extracción completada: ${parts.join(', ')}.`,
      errors > 0 ? 'warning' : 'success'
    );
  }, [lastBatchSummary, addToast]);

  return null;
}
