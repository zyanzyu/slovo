import { useEffect } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { AppProvider } from './lib/store';
import { ToastProvider } from './components/Toast';
import { BottomNav } from './components/BottomNav';
import { Home } from './pages/Home';
import { Library } from './pages/Library';
import { DeckDetail } from './pages/DeckDetail';
import { ImportPage } from './pages/ImportPage';
import { Study } from './pages/Study';
import { Settings } from './pages/Settings';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function PageShell() {
  return (
    <div className="app-shell">
      <Outlet />
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <ToastProvider>
        <BrowserRouter>
          <ScrollToTop />
          <Routes>
            <Route element={<PageShell />}>
              <Route path="/" element={<Home />} />
              <Route path="/library" element={<Library />} />
              <Route path="/library/:deckId" element={<DeckDetail />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
            <Route path="/study" element={<Study />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AppProvider>
  );
}
