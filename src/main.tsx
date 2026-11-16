import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* スマホ前提（2026-11-14 指示）：PCでも幅430pxのスマホの枠の中に表示する */}
    <div className="phone-frame">
      <div className="phone-scroll" id="phone-scroll">
        <App />
      </div>
    </div>
  </StrictMode>,
);
