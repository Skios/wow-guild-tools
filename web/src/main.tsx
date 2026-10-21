import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyPrefs, loadPrefs } from './theme';
import './styles.css';

applyPrefs(loadPrefs()); // so the login screen already wears the saved theme

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
