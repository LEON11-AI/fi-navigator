import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import posthog from 'posthog-js';
import { PostHogProvider } from 'posthog-js/react';
import App from './App.tsx';
import './index.css';

posthog.init('phc_sGaynKPrcVbBqauxQd8uVZ8dpWjlYfkkEk9MWkDEWrqp', {
  api_host: 'https://us.i.posthog.com',
  session_recording: {
    maskAllInputs: false,
    maskInputOptions: {
      password: true,
      email: true
    }
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PostHogProvider client={posthog}>
      <App />
    </PostHogProvider>
  </StrictMode>,
);
