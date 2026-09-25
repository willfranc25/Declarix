import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import ErrorBoundary from './components/ErrorBoundary';
import { CompanyProvider } from './context/CompanyContext';
import AppLayout from './components/Layout/AppLayout';

// Todas las páginas son lazy: mantiene Recharts (Dashboard) y demás librerías
// pesadas fuera del bundle inicial que carga la landing pública y el login.
const PortfolioPage = lazy(() => import('./pages/PortfolioPage'));
const UsagePage = lazy(() => import('./pages/UsagePage'));
const ReconcilePage = lazy(() => import('./pages/ReconcilePage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const UploadPage = lazy(() => import('./pages/UploadPage'));
const InvoicesPage = lazy(() => import('./pages/InvoicesPage'));
const InvoiceDetailPage = lazy(() => import('./pages/InvoiceDetailPage'));
const BatchReviewPage = lazy(() => import('./pages/BatchReviewPage'));
const ReportsPage = lazy(() => import('./pages/ReportsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const LandingPage = lazy(() => import('./pages/LandingPage'));
const TermsPage = lazy(() => import('./pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('./pages/legal/PrivacyPage'));


// Loading fallback for lazy pages
function PageLoader() {
  return (
    <div className="loading-screen" style={{ minHeight: '300px' }}>
      <div className="spinner" style={{ margin: '0 auto 1rem' }} />
      <p className="text-muted">Cargando página...</p>
    </div>
  );
}

// Protected route wrapper
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '300px' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <p className="text-muted">Verificando sesión...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Raíz del sitio: landing para visitantes, aplicación para usuarios con sesión
function HomeRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '300px' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <p className="text-muted">Cargando...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={<PageLoader />}>
        <LandingPage />
      </Suspense>
    );
  }

  return (
    <AppLayout>
      <PortfolioPage />
    </AppLayout>
  );
}

// Public route wrapper (redirects if already logged in)
function PublicRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen" style={{ minHeight: '300px' }}>
        <div className="spinner" style={{ margin: '0 auto 1rem' }} />
        <p className="text-muted">Cargando...</p>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/" replace />;
  }

  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Raíz: landing pública sin sesión, dashboard con sesión */}
      <Route path="/" element={<HomeRoute />} />

      {/* Public routes */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route path="/terminos" element={<Suspense fallback={<PageLoader />}><TermsPage /></Suspense>} />
      <Route path="/privacidad" element={<Suspense fallback={<PageLoader />}><PrivacyPage /></Suspense>} />

      {/* Protected routes */}
      <Route
        path="/*"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="dashboard" element={<DashboardPage />} />
                  <Route path="usage" element={<UsagePage />} />
                  <Route path="reconcile" element={<ReconcilePage />} />
                  <Route path="upload" element={<UploadPage />} />
                  <Route path="batch-review" element={<BatchReviewPage />} />
                  <Route path="invoices" element={<InvoicesPage />} />
                  <Route path="invoices/:id" element={<InvoiceDetailPage />} />
                  <Route path="reports" element={<ReportsPage />} />
                  <Route path="settings" element={<SettingsPage />} />
                  <Route path="reset-password" element={<ResetPasswordPage />} />
                </Routes>
              </Suspense>
            </AppLayout>
          </ProtectedRoute>
        }
      />

      {/* Redirect unknown routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <CompanyProvider><ToastProvider>
            <AppRoutes />
          </ToastProvider></CompanyProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}