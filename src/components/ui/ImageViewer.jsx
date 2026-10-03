import { useEffect, useRef, useState, useCallback } from 'react';
import Icon from './Icon';
import { useDialogBehavior } from './Modal';

/**
 * Visor de imágenes para verificar boletas contra los datos extraídos.
 *
 * - ZoomableImage: lienzo con zoom (rueda / doble clic / botones) y arrastre
 *   para desplazarse cuando está ampliada. Pensado para leer montos y RUT
 *   directamente desde la foto.
 * - ImageLightbox: overlay a pantalla completa con el mismo lienzo
 *   (Escape cierra, foco gestionado).
 */

const MIN_SCALE = 1;
const MAX_SCALE = 6;

export function ZoomableImage({ src, alt = 'Comprobante', focus = null, upgradeSrc = null, detailLoading = false }) {
  // A new DOM image cannot retain pixels from the previous receipt while loading.
  return <ImageCanvas key={src} src={src} alt={alt} focus={focus} upgradeSrc={upgradeSrc} detailLoading={detailLoading} />;
}

function ImageCanvas({ src, alt, focus, upgradeSrc, detailLoading }) {
  const containerRef = useRef(null);
  const imageRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const [displayedSrc, setDisplayedSrc] = useState(src);
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeFailed, setUpgradeFailed] = useState(false);
  const initialFocusApplied = useRef(false);
  useEffect(() => {
    if (!upgradeSrc || upgradeSrc === src) return undefined;
    let current = true;
    const image = new Image();
    setUpgrading(true); setUpgradeFailed(false);
    const ready = image.decode
      ? () => image.decode()
      : () => new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; });
    // Install the fallback handlers before setting src in older browsers.
    const completion = image.decode ? null : ready();
    image.src = upgradeSrc;
    (completion || ready()).then(() => {
      if (current) setDisplayedSrc(upgradeSrc);
    }).catch(() => { if (current) setUpgradeFailed(true); })
      .finally(() => { if (current) setUpgrading(false); });
    return () => { current = false; };
  }, [src, upgradeSrc]);

  // Reiniciar zoom al cambiar de imagen
  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [src]);

  const applyFocus = useCallback(() => {
    if (!focus || !imageRef.current) return;
    const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, focus.scale || 2.5));
    setScale(nextScale);
    setPos({
      x: -(focus.x - 0.5) * imageRef.current.offsetWidth * nextScale,
      y: -(focus.y - 0.5) * imageRef.current.offsetHeight * nextScale,
    });
  }, [focus]);
  const onImageLoad = useCallback(() => {
    setLoaded(true);
    if (!initialFocusApplied.current) {
      initialFocusApplied.current = true; applyFocus();
    }
  }, [applyFocus]);
  useEffect(() => { applyFocus(); }, [src, applyFocus]);

  const clampScale = (s) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

  const zoomBy = useCallback((factor) => {
    setScale((prev) => {
      const next = clampScale(prev * factor);
      if (next === 1) setPos({ x: 0, y: 0 });
      return next;
    });
  }, []);

  // La rueda necesita listener no-pasivo para poder preventDefault
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const onPointerDown = (e) => {
    if (scale === 1) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const onPointerMove = (e) => {
    if (!drag.current) return;
    setPos({
      x: drag.current.origX + (e.clientX - drag.current.startX),
      y: drag.current.origY + (e.clientY - drag.current.startY),
    });
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const onDoubleClick = () => {
    if (scale > 1) {
      setScale(1);
      setPos({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  return (
    <div className="zoom-view" ref={containerRef}>
      <div
        className="zoom-view-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick}
        style={{ cursor: scale > 1 ? (drag.current ? 'grabbing' : 'grab') : 'zoom-in' }}
      >
        <img
          ref={imageRef}
          src={displayedSrc}
          alt={alt}
          onLoad={onImageLoad}
          onError={() => {
            if (displayedSrc !== src) { setDisplayedSrc(src); setUpgradeFailed(true); }
            else setFailed(true);
          }}
          decoding="async"
          fetchPriority="high"
          draggable={false}
          style={{
            visibility: loaded ? 'visible' : 'hidden',
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: drag.current ? 'none' : 'transform 0.15s ease-out',
          }}
        />
        {loaded && (detailLoading || upgrading || upgradeFailed) && <span role="status" style={{ position: 'absolute', top: 12, left: 12, padding: '6px 10px', background: 'var(--color-bg-primary)', borderRadius: 6, fontSize: 12 }}>
          {upgradeFailed ? 'Se mantiene la vista previa. Puedes ver el original.' : 'Cargando más detalle…'}
        </span>}
        {!loaded && <div role="status" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
          {failed ? 'No se pudo mostrar la imagen.' : 'Cargando imagen…'}
        </div>}
      </div>

      <div className="zoom-view-controls" role="group" aria-label="Controles de zoom">
        <button type="button" onClick={() => zoomBy(1 / 1.3)} aria-label="Alejar" disabled={scale <= MIN_SCALE}>−</button>
        <span className="zoom-view-level">{Math.round(scale * 100)}%</span>
        <button type="button" onClick={() => zoomBy(1.3)} aria-label="Acercar" disabled={scale >= MAX_SCALE}>+</button>
        {scale > 1 && (
          <button type="button" onClick={() => { setScale(1); setPos({ x: 0, y: 0 }); }} aria-label="Restablecer zoom">
            <Icon name="refresh" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

export function ImageLightbox({ src, title, onClose, focus = null, mimeType = 'image/jpeg', upgradeSrc = null, detailLoading = false, onOriginal = null }) {
  const ref = useRef(null);
  useDialogBehavior(ref, onClose);

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || 'Imagen del comprobante'}>
      <div className="lightbox-body" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="truncate" style={{ minWidth: 0 }}>{title}</span>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexShrink: 0 }}>
            {onOriginal && mimeType.startsWith('image/') && <button type="button" className="btn btn-secondary btn-sm" onClick={onOriginal}>Ver original</button>}
            <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
              <Icon name="x" size={18} />
            </button>
          </div>
        </div>
        {mimeType === 'application/pdf'
          ? <iframe className="document-preview" src={src} title={title || 'Comprobante PDF'} style={{ flex: 1, minHeight: 0 }} />
          : <ZoomableImage src={src} alt={title || 'Comprobante'} focus={focus} upgradeSrc={upgradeSrc} detailLoading={detailLoading} />}
      </div>
    </div>
  );
}
