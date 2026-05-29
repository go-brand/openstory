import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const target = document.getElementById('root');
if (!target) throw new Error('root not found');

function showFatal(err: unknown) {
  const div = document.createElement('div');
  div.style.cssText =
    'padding:16px;font-family:ui-monospace,monospace;color:#ff6b6b;background:#0f0f10;white-space:pre-wrap;font-size:12px;';
  div.textContent = `OpenStory — failed to mount:\n\n${
    err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err)
  }`;
  target!.appendChild(div);
}

window.addEventListener('error', (e) => showFatal(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => showFatal(e.reason));

try {
  createRoot(target).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (err) {
  showFatal(err);
}
