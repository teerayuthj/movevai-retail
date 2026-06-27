import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { Toaster } from '@/components/ui/sonner';
import 'leaflet/dist/leaflet.css';
import './index.css';
import { registerAppServiceWorker } from './registerServiceWorker';
import { setupNativeShell } from '@/lib/nativeSetup';

registerAppServiceWorker();
void setupNativeShell();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Toaster />
  </React.StrictMode>,
);
