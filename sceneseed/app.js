// SceneSeed — landing-page glue
// Reflects auth state in the CTA button and routes to the right place.

import { onAuth } from './auth.js';

const ctaBtn = document.getElementById('cta-signin');

onAuth((user) => {
  if (!ctaBtn) return;
  if (user) {
    ctaBtn.textContent = 'Open dashboard';
    ctaBtn.href = 'dashboard.html';
    ctaBtn.dataset.signedIn = 'true';
  } else {
    ctaBtn.textContent = 'Sign in to host a show';
    ctaBtn.href = 'signin.html';
    ctaBtn.dataset.signedIn = 'false';
  }
});
