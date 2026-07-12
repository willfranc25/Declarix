import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { getCurrentTheme, toggleTheme } from '../../utils/theme';
import Icon from '../ui/Icon';
import useUploadQueueStore from '../../store/uploadQueueStore';

const navItems = [
  {
    path: '/',
    label: 'Dashboard',
    shortLabel: 'Inicio',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
      </svg>
    ),
  },
  {
    path: '/upload',
    label: 'Cargar Boleta',
    shortLabel: 'Cargar',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
  },
  {
    path: '/batch-review',
    label: 'Revisión Lote',
    shortLabel: 'Revisar',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    path: '/invoices',
    label: 'Comprobantes',
    shortLabel: 'Boletas',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
  },
  {
    path: '/reports',
    label: 'Reportes',
    shortLabel: 'Reportes',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    path: '/settings',
    label: 'Configuración',
    shortLabel: 'Ajustes',
    icon: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [theme, setTheme] = useState(getCurrentTheme());
  // Boletas en proceso de extracción (visible desde cualquier página)
  const processingCount = useUploadQueueStore(
    (s) => s.queue.filter((q) => ['pending', 'processing', 'waiting'].includes(q.status)).length
  );

  const queueBadge = (path) =>
    path === '/upload' && processingCount > 0 ? (
      <span className="nav-badge" title={`${processingCount} boleta(s) en proceso`}>
        {processingCount}
      </span>
    ) : null;

  const handleLogout = async () => {
    await logout();
  };

  const handleToggleTheme = () => {
    setTheme(toggleTheme());
  };

  const themeIcon = theme === 'light' ? (
    // Luna: cambiar a oscuro
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ) : (
    // Sol: cambiar a claro
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  );

  const logoutIcon = (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
    </svg>
  );

  return (
    <>
      {/* Mobile Top Bar (logo + tema + salir; solo visible en móvil) */}
      <header className="mobile-topbar" role="banner">
        <div className="mobile-topbar-brand">
          <div className="mobile-topbar-logo" aria-hidden="true">
            <Icon name="document" size={18} />
          </div>
          <span>Declarix</span>
        </div>
        <div className="mobile-topbar-actions">
          <button
            className="mobile-topbar-btn"
            onClick={handleToggleTheme}
            aria-label={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
          >
            {themeIcon}
          </button>
          <button
            className="mobile-topbar-btn"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
          >
            {logoutIcon}
          </button>
        </div>
      </header>

      {/* Desktop Sidebar */}
      <aside className="app-sidebar" role="navigation" aria-label="Navegación principal">
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <div className="sidebar-logo-icon" aria-hidden="true">
              <Icon name="document" size={20} />
            </div>
            <div className="sidebar-logo-text">
              <h1>Declarix</h1>
              <p>Gestión de comprobantes</p>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              aria-current={location.pathname === item.path ? 'page' : undefined}
            >
              {item.icon}
              <span>{item.label}</span>
              {queueBadge(item.path)}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          {user?.email && (
            <div className="sidebar-account">
              <div className="sidebar-account-avatar" aria-hidden="true">
                {user.email.charAt(0).toUpperCase()}
              </div>
              <div className="sidebar-account-info">
                <p className="sidebar-account-email" title={user.email}>{user.email}</p>
                <p className="sidebar-account-plan">Plan todo incluido</p>
              </div>
            </div>
          )}
          <button
            className="nav-link"
            onClick={handleToggleTheme}
            aria-label={theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro'}
          >
            {themeIcon}
            <span>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</span>
          </button>
          <button
            className="nav-link text-red-400 hover:bg-red-900/20"
            onClick={handleLogout}
            aria-label="Cerrar sesión"
          >
            {logoutIcon}
            <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Nav */}
      <nav 
        className="mobile-nav" 
        role="navigation" 
        aria-label="Navegación móvil"
        aria-orientation="horizontal"
      >
        <div className="mobile-nav-items">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`}
              aria-current={location.pathname === item.path ? 'page' : undefined}
              aria-label={item.label}
            >
              {item.icon}
              <span>{item.shortLabel}</span>
              {queueBadge(item.path)}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}