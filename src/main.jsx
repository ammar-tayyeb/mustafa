import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Provide an iframe-friendly alert replacement
if (typeof window !== 'undefined') {
  window.alert = (message) => {
    try {
      let toastContainer = document.getElementById('app-toast-container');
      if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'app-toast-container';
        toastContainer.style.cssText =
          'position:fixed;top:1rem;left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:0.5rem;max-width:90%;pointer-events:none;';
        document.body.appendChild(toastContainer);
      }
      const toast = document.createElement('div');
      toast.style.cssText =
        'pointer-events:auto;background:#0f172a;color:#f8fafc;padding:0.75rem 1.25rem;border-radius:0.5rem;box-shadow:0 10px 15px -3px rgba(0,0,0,0.3);font-size:0.875rem;direction:rtl;display:flex;align-items:center;gap:0.75rem;';
      toast.innerHTML = `<span style="flex:1;">${String(message ?? '').replace(/</g, '&lt;')}</span><button style="background:transparent;border:none;color:#94a3b8;cursor:pointer;font-size:1.1rem;line-height:1;padding:0;" aria-label="إغلاق">✕</button>`;
      const btn = toast.querySelector('button');
      if (btn) btn.onclick = () => toast.remove();
      toastContainer.appendChild(toast);
      setTimeout(() => {
        if (toast.parentNode) {
          toast.remove();
        }
      }, 4500);
    } catch {
      console.log('Alert:', message);
    }
  };
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
