import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import AppLayout from './components/layout/AppLayout';
import { Spinner } from './components/ui/misc';
import Login from './pages/Login';
const Overview = lazy(() => import('./pages/Overview'));
const Analyzer = lazy(() => import('./pages/Analyzer'));
const Bulk = lazy(() => import('./pages/Bulk'));
const Moderation = lazy(() => import('./pages/Moderation'));
const Insights = lazy(() => import('./pages/Insights'));
const Reports = lazy(() => import('./pages/Reports'));

function Protected({ children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>;
  return user ? children : <Navigate to="/login" replace state={{ from: loc.pathname }} />;
}

export default function App() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center"><Spinner className="h-6 w-6" /></div>}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Protected><AppLayout /></Protected>}>
        <Route index element={<Overview />} />
        <Route path="analyze" element={<Analyzer />} />
        <Route path="bulk" element={<Bulk />} />
        <Route path="moderation" element={<Moderation />} />
        <Route path="insights" element={<Insights />} />
        <Route path="reports" element={<Reports />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
