import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'sonner'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <Toaster
      theme="dark"
      position="bottom-right"
      toastOptions={{
        style: {
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#e2e2e2',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        },
      }}
    />
  </StrictMode>,
)
