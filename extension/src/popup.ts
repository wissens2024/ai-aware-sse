import { BUILD_MODE, getApiBase } from './config';
import {
  isAuthenticated,
  getAuthUser,
  login,
  logout,
  getSsoConfig,
} from './auth-manager';

const $ = (id: string) => document.getElementById(id);

document.addEventListener('DOMContentLoaded', async () => {
  // Mode badge
  const badge = $('modeBadge');
  if (badge) {
    badge.textContent = BUILD_MODE === 'production' ? 'PROD' : 'DEV';
    badge.classList.add(
      BUILD_MODE === 'production' ? 'mode-prod' : 'mode-dev',
    );
  }

  const loggedIn = await isAuthenticated();

  if (loggedIn) {
    showLoggedInView();
  } else {
    showLoginView();
  }
});

async function showLoggedInView() {
  $('loggedInView')!.classList.remove('hidden');
  $('loginView')!.classList.add('hidden');

  const user = await getAuthUser();
  if (user) {
    $('userEmail')!.textContent = user.email;
    $('userRole')!.textContent =
      `${user.display_name ?? ''} · ${user.role}`.replace(/^ · /, '');
  }

  $('logoutBtn')!.addEventListener('click', async () => {
    await logout();
    showLoginView();
    $('loggedInView')!.classList.add('hidden');
  });

  $('optionsBtn')!.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

async function showLoginView() {
  $('loginView')!.classList.remove('hidden');
  $('loggedInView')!.classList.add('hidden');

  // Check SSO availability
  const ssoConfig = await getSsoConfig();
  if (ssoConfig.enabled) {
    $('ssoBtn')!.classList.remove('hidden');
    $('ssoDivider')!.classList.remove('hidden');

    $('ssoBtn')!.addEventListener('click', async () => {
      const base = await getApiBase();
      // Open SSO in a new tab (extension popup can't handle redirects well)
      chrome.tabs.create({
        url: `${base}/auth/sso/authorize?redirect_after=/login/sso-callback`,
      });
      window.close();
    });
  }

  if (ssoConfig.auth_mode === 'oidc') {
    // OIDC-only mode: hide local login form
    $('localLoginForm')!.classList.add('hidden');
    $('ssoDivider')!.classList.add('hidden');
  }

  // Local login
  $('loginBtn')!.addEventListener('click', handleLogin);

  // Enter key on password field
  $('password')!.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

async function handleLogin() {
  const emailEl = $('email') as HTMLInputElement;
  const passEl = $('password') as HTMLInputElement;
  const errorEl = $('errorMsg')!;
  const btn = $('loginBtn') as HTMLButtonElement;

  const email = emailEl.value.trim();
  const password = passEl.value;

  if (!email || !password) {
    errorEl.textContent = '이메일과 비밀번호를 입력해주세요.';
    errorEl.classList.remove('hidden');
    return;
  }

  btn.disabled = true;
  btn.textContent = '로그인 중...';
  errorEl.classList.add('hidden');

  try {
    await login(email, password);
    // Refresh popup to show logged-in state
    $('loginView')!.classList.add('hidden');
    await showLoggedInView();
  } catch (err) {
    errorEl.textContent =
      err instanceof Error ? err.message : '로그인에 실패했습니다.';
    errorEl.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = '로그인';
  }
}
