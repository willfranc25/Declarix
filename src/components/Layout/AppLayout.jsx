import Sidebar from './Sidebar';
import UploadQueueWatcher from '../UploadQueueWatcher';

export default function AppLayout({ children }) {
  return (
    <div className="app-layout">
      <Sidebar />
      <UploadQueueWatcher />
      <main className="app-main">
        {children}
      </main>
    </div>
  );
}
