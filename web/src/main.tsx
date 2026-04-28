import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from './app/App';
import './index.css';
import { registerServiceWorker } from './shared/pwa/registerServiceWorker';

if (window.location.pathname === '/') {
  window.history.replaceState(null, '', '/app/');
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <BrowserRouter basename="/app">
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

registerServiceWorker();
