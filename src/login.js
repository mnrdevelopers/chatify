import { auth } from './firebase-config.js';
import { setupAuth } from './auth.js';

// Screens
const loadingScreen = document.getElementById('loading-screen');
const loginScreen = document.getElementById('login-screen');

// Hide loading and show login after auth check
function showLogin() {
  if (loadingScreen) {
    loadingScreen.classList.remove('active');
    setTimeout(() => loadingScreen.classList.add('hidden'), 400);
  }
  if (loginScreen) {
    loginScreen.classList.remove('hidden');
    setTimeout(() => loginScreen.classList.add('active'), 50);
  }
}

// ── Auth Tab Switching ────────────────────────────────────────────────
function initTabs() {
  const tabs    = document.querySelectorAll('.auth-tab');
  const panels  = document.querySelectorAll('.auth-panel');
  const errEl   = document.getElementById('auth-error-msg');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      tabs.forEach(t => t.classList.toggle('active', t.dataset.tab === target));
      panels.forEach(p => {
        const id = p.id; // 'auth-panel-login' or 'auth-panel-register'
        p.classList.toggle('active', id === 'auth-panel-' + target);
      });
      // Clear error when switching tabs
      if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
    });
  });
}

// ── Password Show/Hide Toggles ────────────────────────────────────────
function initPasswordToggles() {
  function makeToggle(btnId, inputId) {
    const btn = document.getElementById(btnId);
    const inp = document.getElementById(inputId);
    if (!btn || !inp) return;
    btn.addEventListener('click', () => {
      const showing = inp.type === 'text';
      inp.type = showing ? 'password' : 'text';
      btn.querySelector('i').className = showing ? 'bx bx-show' : 'bx bx-hide';
    });
  }
  makeToggle('toggle-login-pwd', 'auth-password');
  makeToggle('toggle-reg-pwd',   'reg-password');
}

// ── Google button in Register tab mirrors Sign-In tab ─────────────────
function initGoogleRegButton() {
  const regGoogle = document.getElementById('btn-login-google-reg');
  if (regGoogle) {
    regGoogle.addEventListener('click', () => {
      const loginGoogle = document.getElementById('btn-login-google');
      if (loginGoogle) loginGoogle.click();
    });
  }
}

// Initialize Auth Logic
setupAuth((user) => {
  if (user) {
    // If user is already logged in, redirect to main app immediately
    window.location.replace('./index.html');
  } else {
    // Show login screen
    showLogin();
  }
});

// Initialize UI
initTabs();
initPasswordToggles();
initGoogleRegButton();
