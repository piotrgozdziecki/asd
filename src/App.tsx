import React from 'react';
import { StudioApp } from './components/StudioApp';
import { OfflineIndicator } from './components/OfflineIndicator';
import { ToastProvider } from './components/common/ToastContext';

export default function App() {
  return (
    <ToastProvider>
      <StudioApp />
      <OfflineIndicator />
    </ToastProvider>
  );
}
