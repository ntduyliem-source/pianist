import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './style.css';
import { initializeTheme } from './platform/theme';

initializeTheme();
createRoot(document.getElementById('app')!).render(<App />);
