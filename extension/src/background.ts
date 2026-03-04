// Service worker: 필요 시 API 호출을 여기서 하면 CORS를 extension origin으로 받을 수 있음.
// 현재는 content script에서 직접 fetch (backend CORS에 extension origin 추가 필요)
chrome.runtime.onInstalled.addListener(() => {
  console.log('AI-Aware SSE extension installed');
});
