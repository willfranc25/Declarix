/**
 * Manejo del tema visual (oscuro/claro).
 * El tema se aplica como atributo `data-theme` en <html> y los tokens CSS
 * de index.css hacen el resto. La preferencia persiste en localStorage.
 */

const STORAGE_KEY = 'declarix-theme';
const THEMES = ['dark', 'light'];

export function getStoredTheme() {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(value) ? value : null;
  } catch {
    return null;
  }
}

export function getCurrentTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme) {
  const value = THEMES.includes(theme) ? theme : 'dark';
  document.documentElement.dataset.theme = value;

  // Sincronizar el color de la barra del navegador (PWA) con --color-bg-primary
  const meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (meta) {
    meta.setAttribute('content', value === 'light' ? '#f7f8fa' : '#17181c');
  }
}

/** Aplica el tema guardado (default: claro). Llamar una vez al arrancar. */
export function initTheme() {
  applyTheme(getStoredTheme() || 'light');
}

/** Alterna el tema, lo persiste y devuelve el tema resultante. */
export function toggleTheme() {
  const next = getCurrentTheme() === 'light' ? 'dark' : 'light';
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // sin persistencia (modo privado): igual se aplica en esta sesión
  }
  applyTheme(next);
  return next;
}
