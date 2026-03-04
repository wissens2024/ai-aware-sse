import { getApiBase, getDeviceToken, getActorHint, DEFAULT_DEVICE_TOKEN, BUILD_MODE } from './config';

declare const __EXT_ENV__: { API_BASE: string };

document.addEventListener('DOMContentLoaded', () => {
  const badge = document.getElementById('modeBadge');
  if (badge) {
    badge.textContent = BUILD_MODE === 'production' ? 'PROD' : 'DEV';
    badge.style.color = BUILD_MODE === 'production' ? '#dc2626' : '#16a34a';
  }
});

document.getElementById('save')?.addEventListener('click', async () => {
  const apiBase = (document.getElementById('apiBase') as HTMLInputElement)?.value?.trim();
  const deviceToken = (document.getElementById('deviceToken') as HTMLInputElement)?.value?.trim();
  const actorEmail = (document.getElementById('actorEmail') as HTMLInputElement)?.value?.trim() || null;
  const actorGroups = (document.getElementById('actorGroups') as HTMLInputElement)?.value?.trim() || null;
  if (chrome?.storage?.local) {
    await chrome.storage.local.set({
      apiBase: apiBase || __EXT_ENV__.API_BASE,
      deviceToken: deviceToken || DEFAULT_DEVICE_TOKEN,
      ...(actorEmail != null && { actorEmail }),
      ...(actorGroups != null && { actorGroups }),
    });
    alert('저장되었습니다.');
  }
});

(async () => {
  if (chrome?.storage?.local) {
    const base = await getApiBase();
    const token = await getDeviceToken();
    const hint = await getActorHint();
    (document.getElementById('apiBase') as HTMLInputElement).value = base;
    (document.getElementById('deviceToken') as HTMLInputElement).value = token;
    (document.getElementById('actorEmail') as HTMLInputElement).value = hint.email ?? '';
    (document.getElementById('actorGroups') as HTMLInputElement).value = hint.groups.join(', ');
  }
})();
