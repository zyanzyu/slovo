import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import { isNativeShell } from './lib/platform';

createRoot(document.getElementById('root')!).render(<App />);

if ('serviceWorker' in navigator && import.meta.env.PROD && !isNativeShell()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // The app still works without offline caching.
    });
  });
}
