import { Link, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import UploadQueueWatcher from '../UploadQueueWatcher';
import CompanyBar from './CompanyBar';
import { useCompany } from '../../context/CompanyContext';
import '../../styles/workspace.css';
export default function AppLayout({ children }) {
  const { activeCompany, loading } = useCompany();
  const { pathname } = useLocation();
  const companyNeeded = !['/', '/reset-password'].includes(pathname);
  return <div className="app-layout"><Sidebar /><UploadQueueWatcher />
    <main className="app-main"><CompanyBar />
      {loading ? <p role="status">Cargando cartera…</p> : companyNeeded && !activeCompany
        ? <div className="card portfolio-empty"><h1>Elige una empresa para continuar</h1><p>Todos los documentos y ajustes pertenecen a la empresa seleccionada.</p><Link className="btn btn-primary" to="/">Ir a mi cartera</Link></div>
        : <div key={activeCompany?.id || 'portfolio'}>{children}</div>}
    </main>
  </div>;
}
import '../../styles/workspace.css';
