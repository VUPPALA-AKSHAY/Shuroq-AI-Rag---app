import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import { Agentation } from 'agentation';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Chat = lazy(() => import('./pages/Chat'));
const KaggleImport = lazy(() => import('./pages/KaggleImport'));
const Settings = lazy(() => import('./pages/Settings'));
const Login = lazy(() => import('./pages/Login'));

const PageFallback = () => (
  <div className="flex flex-1 items-center justify-center bg-surface-container-lowest p-6 text-primary">
    <div className="h-8 w-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
  </div>
);

function AppContent() {
  const { user, login } = useApp();

  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>

        <Route path="/login" element={<Login onLogin={login} />} />

        <Route
          path="/*"
          element={
            user ? (
              <Layout>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/dashboard" element={<Navigate to="/" />} />
                  <Route path="/chat" element={<Chat />} />
                  <Route path="/kaggle" element={<KaggleImport />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" />} />
                </Routes>
              </Layout>
            ) : (
              <Navigate to="/login" />
            )
          }
        />
      </Routes>
    </Suspense>
  );
}

function App() {
  const showAgentation =
    import.meta.env.DEV && import.meta.env.VITE_ENABLE_AGENTATION === 'true';

  return (
    <AppProvider>
      <Router>
        <AppContent />
      </Router>

      {showAgentation && (
        <Agentation
          endpoint="http://localhost:4747"
          onSessionCreated={(sessionId) =>
            console.log('[Agentation] Session started:', sessionId)
          }
          onAnnotationAdd={(a) =>
            console.log('[Agentation] Annotation added:', a)
          }
          onSubmit={(annotations) =>
            console.log('[Agentation] Annotations sent:', annotations)
          }
        />
      )}
    </AppProvider>
  );
}

export default App;
