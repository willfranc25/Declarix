import { useCompany } from '../context/CompanyContext';
import { useEffect, useRef } from 'react';
import useUploadQueueStore from '../store/uploadQueueStore';
import { useToast } from './ui/Toast';

/**
 * Observa la cola de extracción global y notifica cuando termina un lote,
 * sin importar en qué página esté el usuario. No renderiza nada.
 */
export default function UploadQueueWatcher() {
  const { activeCompany } = useCompany();
  const queueError = useUploadQueueStore(s => s.error);
  const uploading = useUploadQueueStore(s => Boolean(s.uploadProgress));
  useEffect(()=>{
    if(!uploading)return;
    const warn=e=>{e.preventDefault();e.returnValue='';};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[uploading]);
  useEffect(() => {
    if (!activeCompany) return;
    let busy = false;
    const refresh = async () => {
      if (busy) return;
      busy = true;
      try { await useUploadQueueStore.getState().hydrate(); } finally { busy = false; }
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [activeCompany?.id]);
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

  return queueError ? <div className="queue-global-error" role="alert" style={{position:"fixed",bottom:80,right:20,zIndex:60,maxWidth:400,padding:16,background:"var(--color-bg-secondary)",border:"1px solid var(--color-danger)",borderRadius:8}}>{queueError}<button aria-label="Cerrar aviso" className="btn btn-ghost" onClick={() => useUploadQueueStore.setState({error:null})}>×</button></div> : null;
}
