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

export function ZoomableImage({ src, alt = 'Comprobante' }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  // Reiniciar zoom al cambiar de imagen
  useEffect(() => {
    setScale(1);
    setPos({ x: 0, y: 0 });
  }, [src]);

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
          src={src}
          alt={alt}
          draggable={false}
          style={{
            transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
            transition: drag.current ? 'none' : 'transform 0.15s ease-out',
          }}
        />
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

export function ImageLightbox({ src, title, onClose }) {
  const ref = useRef(null);
  useDialogBehavior(ref, onClose);

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-label={title || 'Imagen del comprobante'}>
      <div className="lightbox-body" ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="truncate">{title}</span>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
            <Icon name="x" size={18} />
          </button>
        </div>
        <ZoomableImage src={src} alt={title || 'Comprobante'} />
      </div>
    </div>
  );
}
