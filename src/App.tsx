import React from 'react';
import { StudioApp } from './components/StudioApp';
import { OfflineIndicator } from './components/OfflineIndicator';

export default function App() {
  return (
    <>
      <StudioApp />
      <OfflineIndicator />
    </>
  );
}
