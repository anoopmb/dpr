import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// ── Prevent Ant Design table column headers from auto-focusing on page/route load ──
// Tracks whether a real user action preceded the focus event.
let _userInteracting = false;
const _setInteracting = () => { _userInteracting = true; };
document.addEventListener('mousedown',   _setInteracting, true);
document.addEventListener('keydown',     _setInteracting, true);
document.addEventListener('touchstart',  _setInteracting, true);
document.addEventListener('focusin', (e) => {
  const target = e.target as HTMLElement;
  if (!_userInteracting && target.closest('.ant-table-thead')) {
    target.blur();
  }
  _userInteracting = false;
}, true);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
