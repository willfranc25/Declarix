import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Escape clipping/transforming ancestors while keeping the menu next to its trigger.
export default function AnchoredMenu({ anchorRef, onClose, id, children }) {
  const menuRef = useRef(null);
  const [position, setPosition] = useState(null);

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;
      const menu = menuRef.current;
      if (!anchor || !menu) return;
      const rect = anchor.getBoundingClientRect();
      if (rect.bottom <= 0 || rect.top >= window.innerHeight || rect.right <= 0 || rect.left >= window.innerWidth) {
        onClose();
        return;
      }
      const { width, height } = menu.getBoundingClientRect();
      const margin = 8, gap = 4;
      const below = window.innerHeight - rect.bottom - gap;
      const above = rect.top - gap;
      const desiredTop = below >= height || below >= above ? rect.bottom + gap : rect.top - height - gap;
      const top = Math.max(margin, Math.min(desiredTop, window.innerHeight - height - margin));
      const left = Math.max(margin, Math.min(rect.right - width, window.innerWidth - width - margin));
      setPosition(previous => previous?.top === top && previous?.left === left ? previous : { top, left });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    if (anchorRef.current) observer?.observe(anchorRef.current);
    if (menuRef.current) observer?.observe(menuRef.current);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      observer?.disconnect();
    };
  }, [anchorRef, onClose]);

  const positioned = position !== null;
  useLayoutEffect(() => {
    if (positioned) menuRef.current?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [positioned]);

  useEffect(() => {
    const dismissOutside = event => {
      if (!menuRef.current?.contains(event.target) && !anchorRef.current?.contains(event.target)) onClose();
    };
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [anchorRef, onClose]);

  const handleKeyDown = event => {
    if (event.key === 'Escape' || event.key === 'Tab') {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      anchorRef.current?.focus({ preventScroll: true });
      onClose();
      return;
    }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const items = [...menuRef.current.querySelectorAll('[role="menuitem"]:not(:disabled)')];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1
      : (current + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
    items[next].focus({ preventScroll: true });
  };

  return createPortal(
    <div ref={menuRef} id={id} className="row-actions-menu" role="menu" aria-label="Acciones del comprobante"
      style={{ top: position?.top ?? 0, left: position?.left ?? 0, visibility: position ? 'visible' : 'hidden' }}
      onClick={event => event.stopPropagation()} onKeyDown={handleKeyDown}>
      {children}
    </div>, document.body,
  );
}
