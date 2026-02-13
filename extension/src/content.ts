/**
 * AI-Aware SSE Content Script (단일 흐름)
 *
 * 1) PASTE: 텍스트 → PASTE 요청; 파일/이미지 → UPLOAD_SELECT 요청 (preventDefault 안 함, 사이트가 처리).
 * 2) DROP: 파일 드롭 → UPLOAD_SELECT 요청 (preventDefault 안 함).
 * 3) FILE INPUT change/input: 파일 선택 → 파일마다 UPLOAD_SELECT 1건 (디더플 3초).
 * 4) SUBMIT: form submit / mousedown / click / Enter → getSubmitPayload(form)로 한 번만 계산 후 runSubmitDecision 1회 (1.2초 디더플).
 *
 * site-config: composer, sendButton, attachment 개수는 있으면 사용, 없으면 휴리스틱/input[type=file] 합산.
 */
import { getActorHint, getActorEmail } from './config';
import {
  requestDecision,
  createApprovalCase,
  getApprovalCaseStatus,
  buildDecisionRequest,
  type DecisionResponse,
  type SubmitKind,
} from './api';
import { showDecisionModal } from './modal';
import { applyMask, applyAnonymize } from './transform';
import {
  getSiteConfig,
  queryBySelectors,
  countAttachmentsFromDOM,
  countAttachmentsByItemSelectors,
} from './site-config';

const SEND_SELECTORS = [
  'button[data-testid="send-button"]',
  'button[aria-label="Send message"]',
  'button[aria-label="Send"]',
  'form button[type="submit"]',
  'button:has(svg)', // chatgpt send icon
];
const TEXTAREA_SELECTORS = ['textarea[data-id="root"]', 'textarea[placeholder*="Message"]', 'form textarea', '#prompt-textarea'];
// ChatGPT 등: contenteditable 입력 영역 (id, role, data 속성)
const CONTENTEDITABLE_SELECTORS = [
  '#prompt-textarea',
  '[data-id="root"][contenteditable="true"]',
  '[role="textbox"][contenteditable="true"]',
  'form [contenteditable="true"]',
  'div[contenteditable="true"]',
];

function getDomain(): string {
  return window.location.hostname;
}

/** Gemini: 가로채기 시 재실행이 동작하지 않아 전송이 스킵됨. 로그만 남기고 preventDefault 하지 않음 */
function isSubmitLogOnlyDomain(): boolean {
  return getDomain().includes('gemini.google.com');
}

function isTargetDomain(): boolean {
  const d = getDomain();
  return (
    d === 'chatgpt.com' ||
    d.endsWith('.chatgpt.com') ||
    d.includes('copilot.microsoft.com') ||
    d.includes('gemini.google.com') ||
    d === 'claude.ai' ||
    d.endsWith('.anthropic.com')
  );
}

function insertTextAtCursor(text: string): void {
  const sel = document.getSelection();
  const active = document.activeElement as HTMLTextAreaElement | HTMLInputElement | null;
  if (active?.isContentEditable) {
    document.execCommand('insertText', false, text);
    return;
  }
  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? 0;
    const val = active.value;
    active.value = val.slice(0, start) + text + val.slice(end);
    active.selectionStart = active.selectionEnd = start + text.length;
    active.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  document.execCommand('insertText', false, text);
}

/** 입력 영역 전체를 지정한 텍스트로 교체 (SUBMIT 시 MASK/ANONYMIZE 적용 후 전송용) */
function setInputText(text: string): void {
  const el = findInputElement();
  if (!el) return;
  if (el instanceof HTMLTextAreaElement || (el as HTMLInputElement).tagName === 'INPUT') {
    (el as HTMLTextAreaElement).value = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if ((el as HTMLElement).isContentEditable) {
    (el as HTMLElement).focus();
    (el as HTMLElement).innerText = text;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/** 붙여넣기 최대 길이. 초과 시 한 번에 삽입하면 에디터가 멈추므로 제한 후 안내만 함 */
const PASTE_MAX_CHARS = 20_000;

// ---- Paste ----
/**
 * 붙여넣기 시 "텍스트" vs "첨부(파일)" 구분은 본문 길이가 아니라 클립보드 내용으로 결정됨.
 * - 텍스트만 선택 후 복사 → clipboardData에 text/plain만 있음 → PASTE(텍스트) 처리.
 * - 이미지 포함 영역/화면캡처 복사 등 → clipboardData.items에 kind=== 'file'(image/png 등) 있음 → UPLOAD_SELECT 처리.
 */
/** clipboardData에서 첫 번째 파일 추출 (paste 시 파일/이미지 감지용) */
function getPastedFile(e: ClipboardEvent): File | null {
  const all = getPastedFiles(e);
  return all.length ? all[0] : null;
}

/** clipboardData에서 모든 파일 추출 (paste 시 여러 파일 동시 붙여넣기 대응) */
function getPastedFiles(e: ClipboardEvent): File[] {
  const dt = e.clipboardData;
  if (!dt) return [];
  const out: File[] = [];
  for (let i = 0; i < dt.items.length; i++) {
    const item = dt.items[i];
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) out.push(file);
    }
  }
  if (out.length) return out;
  if (dt.files?.length) return Array.from(dt.files);
  return [];
}

/** 이미지 파일이면 contenteditable에 img 삽입 (붙여넣기 허용 시 재현용) */
function insertPastedImageIntoEditor(file: File, target: HTMLElement): void {
  if (!file.type.startsWith('image/')) return;
  const url = URL.createObjectURL(file);
  const img = document.createElement('img');
  img.src = url;
  img.alt = file.name;
  img.style.maxWidth = '100%';
  img.style.height = 'auto';
  if (target?.isContentEditable) {
    const sel = document.getSelection();
    const range = sel?.rangeCount ? sel.getRangeAt(0) : null;
    if (range) {
      range.insertNode(img);
      range.collapse(false);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      target.appendChild(img);
      target.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function initPaste(): void {
  document.addEventListener(
    'paste',
    (e) => {
      if (!isTargetDomain()) return;
      const target = e.target as HTMLElement;
      const tag = target?.tagName?.toLowerCase();
      const isDirectInput = tag === 'textarea' || tag === 'input' || target?.isContentEditable === true;
      const inInputArea = target?.closest?.('textarea, input, [contenteditable="true"], [contenteditable]');
      const isInput = isDirectInput || !!inInputArea;
      if (!isInput) {
        console.log('[AI-Aware SSE] Paste 스킵: 입력 영역 아님', { tag, inInputArea: !!inInputArea });
        return;
      }

      const pastedFiles = getPastedFiles(e);
      if (pastedFiles.length > 0) {
        // 파일/이미지 붙여넣기 → 파일마다 UPLOAD_SELECT 1건. preventDefault 하지 않아 ChatGPT 등 사이트가 paste를 처리해 첨부 목록에 표시되게 함.
        const toSend = pastedFiles.filter((f) => !shouldSkipUploadSelectDedupe(f));
        if (toSend.length > 0) {
          console.log('[AI-Aware SSE] Paste(파일/이미지) 감지:', toSend.length, '개 → UPLOAD_SELECT', toSend.length, '건');
          toSend.forEach((pastedFile) => {
            const meta = {
              name: pastedFile.name || 'pasted',
              size_bytes: pastedFile.size,
              mime: pastedFile.type || undefined,
              ext: pastedFile.name?.split('.').pop()?.toLowerCase(),
            };
            (async () => {
              try {
                const actor = await getActorHint();
                const req = buildDecisionRequest({ eventType: 'UPLOAD_SELECT', fileMeta: meta, actor });
                injectApprovedCaseOnce(req, false);
                const res = await requestDecision(req);
                if (res.outcome !== 'ALLOW') {
                  showDecisionModal(res, (action, payload) => {
                    if (action === 'continue') {}
                    if (action === 'request_approval') requestApprovalFlow(res, payload?.request_reason);
                  });
                }
              } catch (err) {
                console.error('[AI-Aware SSE] Decision request failed (paste file):', err);
              }
            })();
          });
        }
        return;
      }

      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (!text) {
        console.log('[AI-Aware SSE] Paste 스킵: text/plain 없음 (이미지만?)');
        return;
      }

      console.log('[AI-Aware SSE] Paste(텍스트) 감지:', text.length, '자 → PASTE 요청');

      if (text.length > PASTE_MAX_CHARS) {
        e.preventDefault();
        e.stopImmediatePropagation();
        showDecisionModal(
          {
            decision_id: '',
            event_id: '',
            outcome: 'ALLOW',
            action: {
              type: 'ALLOW',
              message: `붙여넣기 길이 제한(최대 ${(PASTE_MAX_CHARS / 10000).toFixed(0)}만 자). 필요한 부분만 선택해 붙여넣어 주세요.`,
              allow_approval_request: false,
            },
            risk_score: 0,
            matched_policy: null,
            detector_hits: [],
            explanation: { summary: '', safe_details: [] },
          },
          () => {},
        );
        return;
      }

      e.preventDefault();
      e.stopImmediatePropagation();

      (async () => {
        try {
          const actor = await getActorHint();
          const req = buildDecisionRequest({ eventType: 'PASTE', textContent: text, actor });
          injectApprovedCaseOnce(req, false);
          const res = await requestDecision(req);
          if (res.outcome === 'ALLOW') {
            insertTextAtCursor(text);
          } else if (res.outcome === 'MASK' && res.action?.mask) {
            const transformed = applyMask(text, res.action.mask as Record<string, string>);
            insertTextAtCursor(transformed);
            showDecisionModal(res, () => {});
          } else if (res.outcome === 'ANONYMIZE' && res.action?.anonymize) {
            const transformed = applyAnonymize(text, res.action.anonymize as Record<string, string>);
            insertTextAtCursor(transformed);
            showDecisionModal(res, () => {});
          } else {
            showDecisionModal(res, (action, payload) => {
              if (action === 'continue') insertTextAtCursor(text);
              if (action === 'request_approval') requestApprovalFlow(res, payload?.request_reason);
            });
          }
        } catch (err) {
          console.error('[AI-Aware SSE] Decision request failed (paste):', err);
          insertTextAtCursor(text);
        }
      })();
    },
    true,
  );
}

// ---- Drag & drop (PDF 등 드롭 시 UPLOAD_SELECT) ----
function initDrop(): void {
  const frameLabel = typeof window !== 'undefined' && window !== window.top ? ' [iframe]' : '';

  document.addEventListener(
    'dragover',
    (e) => {
      if (!isTargetDomain()) return;
      const dt = e.dataTransfer;
      const hasFiles = dt?.types?.includes('Files');
      if (hasFiles) {
        console.log('[AI-Aware SSE] dragover (파일 있음)' + frameLabel);
      }
    },
    true,
  );

  document.addEventListener(
    'drop',
    (e) => {
      if (!isTargetDomain()) return;
      const dt = e.dataTransfer;
      const fileCount = dt?.files?.length ?? 0;
      console.log('[AI-Aware SSE] drop 이벤트 수신' + frameLabel + ', files:', fileCount, fileCount ? Array.from(dt!.files).map((f) => f.name + '(' + (f.type || '?') + ')') : '');
      if (!dt?.files?.length) return;
      const files = Array.from(dt.files);
      const toSend = files.filter((f) => !shouldSkipUploadSelectDedupe(f));
      if (toSend.length === 0) return;
      console.log('[AI-Aware SSE] Drop(파일) 감지:', toSend.length, '개 → UPLOAD_SELECT', toSend.length, '건');
      toSend.forEach((file) => {
        const meta = {
          name: file.name || 'dropped',
          size_bytes: file.size,
          mime: file.type || undefined,
          ext: file.name?.split('.').pop()?.toLowerCase(),
        };
        (async () => {
          try {
            const actor = await getActorHint();
            const req = buildDecisionRequest({ eventType: 'UPLOAD_SELECT', fileMeta: meta, actor });
            injectApprovedCaseOnce(req, false);
            const res = await requestDecision(req);
            if (res.outcome !== 'ALLOW') {
              showDecisionModal(res, (action, payload) => {
                if (action === 'request_approval') requestApprovalFlow(res, payload?.request_reason);
              });
            }
          } catch (err) {
            console.error('[AI-Aware SSE] Decision request failed (drop):', err);
          }
        })();
      });
      // preventDefault 하지 않음 → 사이트가 드롭을 처리해 첨부 목록에 표시
    },
    true,
  );
}

// ---- Submit (chatgpt.com 등) ----
let allowNextSend = false;
let allowNextSubmit = false;
/** 승인(APPROVED) 후 전송(SUBMIT) 시 1회 소진. PASTE/UPLOAD_SELECT는 허용만 하고 소진하지 않아 "붙여넣기 후 전송" 한 번에 1회 사용 */
let approvedCaseIdForBypass: string | null = null;

/** approved_case_id를 요청에 넣음. consumeOnSend=true(SUBMIT/UPLOAD_SUBMIT)일 때만 전송 후 id 제거(백엔드도 이때만 소진) */
function injectApprovedCaseOnce(
  req: import('./api').DecisionRequest,
  consumeOnSend?: boolean,
): void {
  if (approvedCaseIdForBypass) {
    req.approved_case_id = approvedCaseIdForBypass;
    if (consumeOnSend) approvedCaseIdForBypass = null;
  }
}
/** 한 번의 사용자 전송에 mousedown+click 둘 다 잡히는 것 방지 (먼저 처리한 쪽만 SUBMIT) */
let submitHandledByMouseDown = false;
/** SUBMIT 중복 전송 방지 (Gemini 등에서 form submit + click 둘 다 오는 경우) */
const SUBMIT_DEDUPE_MS = 1200;
let lastSubmitSentTime = 0;

function findTextarea(): HTMLTextAreaElement | null {
  for (const sel of TEXTAREA_SELECTORS) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLTextAreaElement) return el;
  }
  return document.querySelector('textarea') ?? null;
}

/** 사이트 설정이 있으면 그 선택자로, 없으면 휴리스틱 */
function getComposerElement(): HTMLTextAreaElement | HTMLElement | null {
  const config = getSiteConfig(getDomain());
  if (config?.composer?.length) {
    const el = queryBySelectors(document, config.composer);
    if (el instanceof HTMLElement) return el;
  }
  return null;
}

/** 입력 영역: 사이트 설정 → textarea/contenteditable 휴리스틱 */
function findInputElement(): HTMLTextAreaElement | HTMLElement | null {
  const fromConfig = getComposerElement();
  if (fromConfig) return fromConfig;
  const ta = findTextarea();
  if (ta) return ta;
  for (const sel of CONTENTEDITABLE_SELECTORS) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement && el.isContentEditable) return el;
  }
  return document.querySelector('form [contenteditable="true"]') as HTMLElement | null;
}

function getSubmitText(): string {
  const el = findInputElement();
  if (!el) return '';
  if (el instanceof HTMLTextAreaElement) return el.value?.trim() ?? '';
  const html = el as HTMLElement;
  return html.innerText?.trim() ?? html.textContent?.trim() ?? '';
}

/** 입력 요소를 못 찾을 때: 페이지 내 contenteditable 중 비어 있지 않은 텍스트 (Claude ProseMirror 등 fallback) */
function getComposerTextFallback(): string {
  try {
    let t = getSubmitText();
    if (t) return t;
    const composer = getComposerElement();
    if (composer instanceof HTMLElement) {
      t = (composer.innerText ?? composer.textContent)?.trim() ?? '';
      if (t) return t;
    }
    const active = document.activeElement as HTMLElement | null;
    if (active?.isContentEditable) {
      t = (active.innerText ?? active.textContent)?.trim() ?? '';
      if (t) return t;
    }
    const editables = document.querySelectorAll('[contenteditable="true"]');
    for (const el of editables) {
      if (!(el instanceof HTMLElement)) continue;
      try {
        t = (el.innerText ?? el.textContent)?.trim() ?? '';
        if (t.length > 0) return t;
      } catch {
        // detached or cross-boundary
      }
    }
  } catch {
    // ignore
  }
  return '';
}

/** 첨부/업로드 버튼인지 (전송 버튼과 구분해 가로채지 않음) */
const ATTACH_KEYWORDS = /attach|upload|file|clip|paper|image|photo|사진|첨부|파일|업로드|추가/i;
function isAttachButton(btn: HTMLElement | null): boolean {
  if (!btn) return false;
  const label =
    btn.getAttribute?.('aria-label') ??
    btn.getAttribute?.('title') ??
    btn.getAttribute?.('data-testid') ??
    (btn as HTMLElement).textContent ??
    '';
  return ATTACH_KEYWORDS.test(label);
}

/** 답변 생성 중 '중지' 버튼인지 (전송 버튼으로 오인하지 않도록 제외) */
const STOP_KEYWORDS = /stop|중지|취소|cancel|abort/i;
function isStopButton(btn: HTMLElement | null): boolean {
  if (!btn) return false;
  const label =
    btn.getAttribute?.('aria-label') ??
    btn.getAttribute?.('title') ??
    (btn as HTMLElement).textContent ??
    '';
  return STOP_KEYWORDS.test(label);
}

/** form 또는 document에서 파일이 선택된 input[type=file] 찾기 */
function findFileInputWithFiles(form?: HTMLFormElement | null): HTMLInputElement | null {
  const root = form ?? document;
  const inputs = root.querySelectorAll('input[type="file"]');
  for (const el of inputs) {
    if (el instanceof HTMLInputElement && el.files?.length) return el;
  }
  return null;
}

/** 첨부 개수: site-config(attachmentItemSelectors → attachmentContainer) → form/document 내 file input 파일 수 합산 */
function getAttachmentCount(form?: HTMLFormElement | null): number {
  const config = getSiteConfig(getDomain());
  if (config?.attachmentItemSelectors?.length) {
    const n = countAttachmentsByItemSelectors(document, config.attachmentItemSelectors);
    if (n > 0) return n;
  }
  if (config?.attachmentContainer?.length) {
    const fromDOM = countAttachmentsFromDOM(document, config.attachmentContainer);
    if (fromDOM > 0) return fromDOM;
  }
  const root = form ?? document;
  let sum = 0;
  root.querySelectorAll('input[type="file"]').forEach((el) => {
    if (el instanceof HTMLInputElement && el.files?.length) sum += el.files.length;
  });
  if (sum > 0) return sum;
  const single = findFileInputWithFiles(form ?? null) ?? findFileInputWithFiles(null);
  return single?.files?.length ?? 0;
}

function findSendButton(): HTMLElement | null {
  const config = getSiteConfig(getDomain());
  if (config?.sendButton?.length) {
    const el = queryBySelectors(document, config.sendButton);
    if (el instanceof HTMLElement) return el;
  }
  for (const sel of SEND_SELECTORS) {
    const el = document.querySelector(sel);
    if (el instanceof HTMLElement) return el;
  }
  const buttons = document.querySelectorAll('button');
  for (const b of buttons) {
    if (b.getAttribute('aria-label')?.toLowerCase().includes('send')) return b;
    if (b.querySelector('svg') && b.closest('form')) return b;
  }
  return null;
}

/** 전송 입력을 포함한 form (submit 이벤트 가로채기용) */
function findInputForm(): HTMLFormElement | null {
  const forms = document.querySelectorAll('form');
  for (const form of forms) {
    if (form.querySelector('textarea') || form.querySelector('[contenteditable="true"]')) {
      return form as HTMLFormElement;
    }
  }
  return null;
}

/** SUBMIT 시 보낼 payload 단일 계산 (form/mousedown/click/enter 모두 이 값 사용). 텍스트는 composer 우선, 없으면 페이지 내 contenteditable fallback (Claude 등) */
function getSubmitPayload(form: HTMLFormElement | null): {
  text: string;
  submitKind: SubmitKind;
  fileMeta?: { name: string; size_bytes: number; mime?: string; ext?: string };
  hasText: boolean;
  hasAttachments: boolean;
} {
  const text = getComposerTextFallback();
  const attachmentCount = getAttachmentCount(form);
  const hasText = (text ?? '').length > 0;
  const hasAttachments = attachmentCount > 0;
  const submitKind: SubmitKind = hasAttachments && hasText ? 'mixed' : hasAttachments ? 'files' : 'text';
  const fileInput = findFileInputWithFiles(form) ?? findFileInputWithFiles(null);
  const firstFile = fileInput?.files?.[0];
  const fileMeta =
    firstFile && submitKind !== 'text'
      ? {
          name: firstFile.name,
          size_bytes: firstFile.size,
          mime: firstFile.type || undefined,
          ext: firstFile.name.split('.').pop()?.toLowerCase(),
        }
      : undefined;
  return { text: text ?? '', submitKind, fileMeta, hasText, hasAttachments };
}

function initSubmit(): void {
  const runSubmitDecision = async (
    text: string,
    submitKind: SubmitKind,
    onAllow: () => void,
    fileMeta?: { name: string; size_bytes: number; mime?: string; ext?: string },
  ) => {
    const now = Date.now();
    if (now - lastSubmitSentTime < SUBMIT_DEDUPE_MS) {
      console.log('[AI-Aware SSE] SUBMIT 중복 스킵 (최근', SUBMIT_DEDUPE_MS, 'ms 내 전송됨)');
      onAllow();
      return;
    }
    lastSubmitSentTime = now;
    console.log('[AI-Aware SSE] Sending SUBMIT decision request', { submitKind });
    try {
      const actor = await getActorHint();
      const req = buildDecisionRequest({
        eventType: 'SUBMIT',
        textContent: text,
        submitKind,
        ...(fileMeta && { fileMeta }),
        actor,
      });
      injectApprovedCaseOnce(req, true);
      const res = await requestDecision(req);
      if (res.outcome === 'ALLOW') {
        onAllow();
      } else if (res.outcome === 'MASK' && res.action?.mask) {
        const transformed = applyMask(text, res.action.mask as Record<string, string>);
        setInputText(transformed);
        onAllow();
      } else if (res.outcome === 'ANONYMIZE' && res.action?.anonymize) {
        const transformed = applyAnonymize(text, res.action.anonymize as Record<string, string>);
        setInputText(transformed);
        onAllow();
      } else {
        showDecisionModal(res, (action, payload) => {
          if (action === 'continue') onAllow();
          if (action === 'request_approval') requestApprovalFlow(res, payload?.request_reason);
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Extension context invalidated|context invalidated/i.test(msg)) {
        console.warn('[AI-Aware SSE] 확장이 재로드되었습니다. 이 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      } else {
        console.error('[AI-Aware SSE] Decision request failed (submit):', err);
      }
      onAllow();
    }
  };

  // 1) Form submit 가로채기
  document.addEventListener(
    'submit',
    (e) => {
      if (!isTargetDomain()) return;
      const form = e.target as HTMLFormElement;
      if (!form || form.tagName !== 'FORM') return;
      console.log('[AI-Aware SSE] form submit 이벤트 수신');
      if (allowNextSubmit) {
        allowNextSubmit = false;
        return;
      }
      const payload = getSubmitPayload(form);
      if (!payload.hasText && !payload.hasAttachments) {
        console.log('[AI-Aware SSE] SUBMIT 스킵: 입력/첨부 없음 (form submit)');
        return;
      }
      if (isSubmitLogOnlyDomain()) {
        runSubmitDecision(payload.text, payload.submitKind, () => {}, payload.fileMeta);
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      runSubmitDecision(payload.text, payload.submitKind, () => {
        allowNextSubmit = true;
        form.requestSubmit();
      }, payload.fileMeta);
    },
    true,
  );

  // 2a) mousedown으로 전송 버튼 먼저 가로채기 (React 등이 click을 먼저 처리하는 경우 대비)
  document.addEventListener(
    'mousedown',
    (e) => {
      if (!isTargetDomain() || e.button !== 0) return;
      if (allowNextSend) {
        allowNextSend = false;
        return;
      }
      const btn =
        (e.target as HTMLElement)?.closest?.('button') ??
        (e.target as HTMLElement)?.closest?.('[role="button"]') ??
        (e.target as HTMLElement);
      if (isAttachButton(btn as HTMLElement)) return;
      if (isStopButton(btn as HTMLElement)) return;
      const inFormWithInput =
        btn?.closest('form')?.querySelector('textarea') || btn?.closest('form')?.querySelector('[contenteditable="true"]');
      const isButton = btn && (btn.tagName === 'BUTTON' || btn.getAttribute('role') === 'button');
      const looksLikeSend =
        btn === findSendButton() ||
        inFormWithInput ||
        (findInputElement() && btn?.closest('form') === findInputForm()) ||
        btn?.getAttribute('aria-label')?.toLowerCase().includes('send') ||
        (btn?.querySelector?.('svg') && (btn?.closest?.('[data-id]') || btn?.closest?.('form')));
      if (!isButton || !looksLikeSend) return;
      const form = (btn?.closest('form') ?? findInputForm()) as HTMLFormElement | null;
      const payload = getSubmitPayload(form);

      if (!payload.hasText && !payload.hasAttachments) return;
      if (isSubmitLogOnlyDomain()) {
        if (!payload.hasText && payload.hasAttachments) {
          console.log('[AI-Aware SSE] 전송 버튼 mousedown 감지 (첨부만, 로그만)', { attachmentCount: getAttachmentCount(form) });
        } else {
          console.log('[AI-Aware SSE] 전송 버튼 mousedown 감지 (로그만)', { submitKind: payload.submitKind });
        }
        runSubmitDecision(payload.text, payload.submitKind, () => {}, payload.fileMeta);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      submitHandledByMouseDown = true;
      setTimeout(() => {
        submitHandledByMouseDown = false;
      }, 400);
      if (!payload.hasText && payload.hasAttachments) {
        console.log('[AI-Aware SSE] 전송 버튼 mousedown 감지 (첨부만)', { attachmentCount: getAttachmentCount(form) });
      } else {
        console.log('[AI-Aware SSE] 전송 버튼 mousedown 감지', { submitKind: payload.submitKind });
      }
      runSubmitDecision(payload.text, payload.submitKind, () => {
        allowNextSend = true;
        allowNextSubmit = true;
        (btn as HTMLButtonElement)?.click?.();
        const input = findInputElement();
        if (input) {
          if (input instanceof HTMLTextAreaElement) input.value = '';
          else (input as HTMLElement).innerText = '';
        }
      }, payload.fileMeta);
    },
    true,
  );

  // 2b) 전송 버튼 클릭 가로채기 (submit이 안 뜨는 구조 대비)
  // mousedown에서 이미 가로챈 경우: click이 사이트로 전달되면 확장 확인 전에 전송되어 버리므로 반드시 막음
  document.addEventListener('click', async (e) => {
    if (!isTargetDomain()) return;
    if (submitHandledByMouseDown) {
      submitHandledByMouseDown = false;
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    if (allowNextSend) {
      allowNextSend = false;
      return;
    }
    const sendBtn =
      (e.target as HTMLElement)?.closest?.('button') ??
      (e.target as HTMLElement)?.closest?.('[role="button"]') ??
      (e.target as HTMLElement);
    if (isAttachButton(sendBtn as HTMLElement)) return;
    if (isStopButton(sendBtn as HTMLElement)) return;
    const inFormWithInput =
      sendBtn?.closest('form')?.querySelector('textarea') || sendBtn?.closest('form')?.querySelector('[contenteditable="true"]');
    const isButton = sendBtn && (sendBtn.tagName === 'BUTTON' || sendBtn.getAttribute('role') === 'button');
    const looksLikeSend =
      sendBtn === findSendButton() ||
      inFormWithInput ||
      (findInputElement() && sendBtn?.closest('form') === findInputForm()) ||
      sendBtn?.getAttribute('aria-label')?.toLowerCase().includes('send') ||
      (sendBtn?.querySelector?.('svg') && sendBtn?.closest?.('[data-id]'));
    const isSend = isButton && looksLikeSend;
    if (!isSend) return;

    console.log('[AI-Aware SSE] 전송 버튼 클릭 감지');
    const form = (sendBtn?.closest('form') ?? findInputForm()) as HTMLFormElement | null;
    const payload = getSubmitPayload(form);

    if (!payload.hasText && !payload.hasAttachments) {
      console.log('[AI-Aware SSE] SUBMIT 스킵: 입력/첨부 없음 (버튼 클릭)');
      return;
    }
    if (isSubmitLogOnlyDomain()) {
      if (!payload.hasText && payload.hasAttachments) {
        console.log('[AI-Aware SSE] 전송(첨부만) → SUBMIT submitKind=files (로그만)', { attachmentCount: getAttachmentCount(form) });
      }
      runSubmitDecision(payload.text, payload.submitKind, () => {}, payload.fileMeta);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!payload.hasText && payload.hasAttachments) {
      console.log('[AI-Aware SSE] 전송(첨부만) → SUBMIT submitKind=files', { attachmentCount: getAttachmentCount(form) });
    }
    runSubmitDecision(payload.text, payload.submitKind, () => {
      allowNextSend = true;
      allowNextSubmit = true;
      (sendBtn as HTMLButtonElement)?.click?.();
      const input = findInputElement();
      if (input) {
        if (input instanceof HTMLTextAreaElement) input.value = '';
        else (input as HTMLElement).innerText = '';
      }
    }, payload.fileMeta);
  }, true);

  // 3) Enter 키 (textarea, contenteditable, 또는 포커스된 입력 영역; 포커스 밖이어도 composer에 내용 있으면 전송)
  document.addEventListener(
    'keydown',
    (e) => {
      if (e.key !== 'Enter' || e.shiftKey) return;
      if (!isTargetDomain()) return;
      const form = findInputForm();
      const payload = getSubmitPayload(form);
      const hasContent = payload.hasText || payload.hasAttachments;
      const active = document.activeElement as HTMLElement | null;
      const input = findInputElement();
      const isActiveInput = active === input || (active?.isContentEditable && active?.closest?.('form'));
      const isEditable = !!active?.isContentEditable;

      if (!hasContent) {
        if (isActiveInput || isEditable) console.log('[AI-Aware SSE] SUBMIT 스킵: 입력/첨부 없음 (Enter)');
        else if (active?.tagName) console.log('[AI-Aware SSE] Enter 키: 입력 영역 아님', active.tagName, active.className?.slice(0, 50));
        return;
      }
      console.log('[AI-Aware SSE] Enter 키 감지 (입력 영역 포커스 또는 본문 있음)');
      if (allowNextSend) {
        allowNextSend = false;
        return;
      }
      if (isSubmitLogOnlyDomain()) {
        if (!payload.hasText && payload.hasAttachments) {
          console.log('[AI-Aware SSE] Enter(첨부만) → SUBMIT submitKind=files (로그만)', { attachmentCount: getAttachmentCount(form) });
        }
        runSubmitDecision(payload.text, payload.submitKind, () => {}, payload.fileMeta);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (!payload.hasText && payload.hasAttachments) {
        console.log('[AI-Aware SSE] Enter(첨부만) → SUBMIT submitKind=files', { attachmentCount: getAttachmentCount(form) });
      }
      runSubmitDecision(payload.text, payload.submitKind, () => {
        // Enter 재생은 form.requestSubmit()만 하므로 새 keydown이 발생하지 않음 → allowNextSend 설정 안 함(다음 사용자 Enter가 스킵되지 않도록)
        if (form) {
          allowNextSubmit = true;
          form.requestSubmit();
        } else if (active?.isContentEditable) {
          (active as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
      }, payload.fileMeta);
    },
    true,
  );
}

// ---- Approval flow ----
async function requestApprovalFlow(decisionRes: DecisionResponse, requestReason?: string): Promise<void> {
  try {
    const requestedByEmail = await getActorEmail();
    const caseRes = await createApprovalCase({
      event_id: decisionRes.event_id,
      decision_id: decisionRes.decision_id,
      request_reason: requestReason ?? undefined,
      requested_at: new Date().toISOString(),
      requested_by_email: requestedByEmail ?? undefined,
    });
    const caseId = caseRes.case_id;
    const poll = () =>
      getApprovalCaseStatus(caseId).then((s) => {
        if (s.status === 'APPROVED') {
          const approvalKind = (s.decision as { approval_kind?: string } | null)?.approval_kind ?? 'one_time';
          if (approvalKind === 'user_exception') {
            alert('해당 사용자에 대해 예외가 적용되었습니다. 다시 붙여넣기 또는 전송을 시도해 주세요.');
          } else {
            approvedCaseIdForBypass = caseId;
            alert('승인되었습니다. 다음 붙여넣기 또는 전송 1회가 허용됩니다. 지금 시도해 주세요.');
          }
          return;
        }
        if (s.status === 'REJECTED' || s.status === 'EXPIRED') {
          alert('승인이 거절되었거나 만료되었습니다.');
          return;
        }
        setTimeout(poll, 3000);
      });
    poll();
    alert(`승인 요청이 등록되었습니다. (Case: ${caseId.slice(0, 8)}...) Admin 콘솔에서 처리 후 다시 시도하세요.`);
  } catch (err) {
    alert('승인 요청 실패: ' + (err as Error).message);
  }
}

// ---- File upload (upload_select) ----
// 모든 input[type=file]의 change/input 수신. accept/파일종류 무관 (이미지·PDF 등 동일 처리).
/** 동일 파일에 대한 짧은 시간 내 중복 UPLOAD_SELECT 방지 (paste + change/input 여러 번 발생 시) */
const UPLOAD_SELECT_DEDUPE_MS = 3000;
const recentUploadSelectKeys = new Map<string, number>();

function fileFingerprint(file: { name: string; size: number; lastModified: number }): string {
  return `${file.name}\t${file.size}\t${file.lastModified}`;
}

function shouldSkipUploadSelectDedupe(file: File): boolean {
  const now = Date.now();
  for (const [k, t] of recentUploadSelectKeys) {
    if (now - t > UPLOAD_SELECT_DEDUPE_MS) recentUploadSelectKeys.delete(k);
  }
  const key = fileFingerprint(file);
  if (recentUploadSelectKeys.has(key)) return true;
  recentUploadSelectKeys.set(key, now);
  return false;
}

/** change 이벤트 경로에서 실제 file input 찾기 (Shadow DOM 대응) */
function findFileInputFromEvent(e: Event): HTMLInputElement | null {
  const path = e.composedPath?.() ?? (e.target ? [e.target as Node] : []);
  for (const el of path) {
    if (el instanceof HTMLInputElement && el.type === 'file' && el.files?.length) {
      return el;
    }
  }
  const target = e.target as HTMLInputElement;
  if (target?.type === 'file' && target.files?.length) return target;
  return null;
}

const handlerForFileInput = (e: Event) => {
  if (!isTargetDomain()) return;
  const fileInput = e.target as HTMLInputElement;
  if (!fileInput?.files?.length) return;
  handleFileSelect(fileInput, e);
};

/** root 아래(Shadow 포함) 모든 input[type=file]에 change + input 리스너 부여 */
function attachFileInputListeners(root: Document | ShadowRoot): void {
  const inputs = root.querySelectorAll('input[type="file"]');
  inputs.forEach((input) => {
    if (!(input instanceof HTMLInputElement) || (input as unknown as { __sseListener?: boolean }).__sseListener) return;
    (input as unknown as { __sseListener?: boolean }).__sseListener = true;
    input.addEventListener('change', handlerForFileInput, true);
    input.addEventListener('input', handlerForFileInput, true);
    if (typeof window !== 'undefined' && window === window.top) {
      console.log('[AI-Aware SSE] file input 리스너 부여:', input.id || input.name || '(anonymous)', input.accept || '*');
    }
  });
  root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) attachFileInputListeners(el.shadowRoot);
  });
}

/** 파일 하나에 대해 UPLOAD_SELECT 전송 (공통 로직) */
function sendUploadSelectForFile(
  file: File,
  input: HTMLInputElement,
  onAllowSend?: () => void,
): void {
  if (shouldSkipUploadSelectDedupe(file)) return;
  const meta = {
    name: file.name,
    size_bytes: file.size,
    mime: file.type || undefined,
    ext: file.name.split('.').pop()?.toLowerCase(),
  };
  console.log('[AI-Aware SSE] 파일 선택 감지:', file.name, `(${file.type || 'unknown'})`);
  (async () => {
    console.log('[AI-Aware SSE] Sending UPLOAD_SELECT decision request');
    try {
      const actor = await getActorHint();
      const req = buildDecisionRequest({ eventType: 'UPLOAD_SELECT', fileMeta: meta, actor });
      injectApprovedCaseOnce(req, false);
      const res = await requestDecision(req);
      if (res.outcome === 'ALLOW') {
        input.dispatchEvent(new Event('change', { bubbles: true }));
        onAllowSend?.();
        return;
      }
      input.value = '';
      showDecisionModal(res, (action, payload) => {
        if (action === 'request_approval') requestApprovalFlow(res, payload?.request_reason);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Extension context invalidated|context invalidated/i.test(msg)) {
        console.warn('[AI-Aware SSE] 확장이 재로드되었습니다. 이 페이지를 새로고침한 뒤 다시 시도해 주세요.');
      } else {
        console.error('[AI-Aware SSE] Decision request failed (upload):', err);
      }
      input.dispatchEvent(new Event('change', { bubbles: true }));
      onAllowSend?.();
    }
  })();
}

/** 파일 선택 처리. input에 여러 파일이 있으면 파일마다 UPLOAD_SELECT 1개씩 전송 */
function handleFileSelect(input: HTMLInputElement, e: Event, onAllowSend?: () => void): void {
  const files = input.files;
  if (!files?.length) return;

  e.preventDefault();
  e.stopPropagation();

  const fileList = Array.from(files);
  const types = fileList.map((f) => f.type || f.name?.split('.').pop() || '?').join(', ');
  console.log('[AI-Aware SSE] 파일 선택:', fileList.length, '개', types ? `(${types})` : '', '→ UPLOAD_SELECT', fileList.length, '건 전송');
  if (fileList.length === 1) {
    sendUploadSelectForFile(fileList[0], input, onAllowSend);
    return;
  }
  // 여러 파일: 파일마다 UPLOAD_SELECT 1개씩 전송 (디더플은 sendUploadSelectForFile 내부에서)
  fileList.forEach((file, i) => {
    const isLast = i === fileList.length - 1;
    sendUploadSelectForFile(file, input, isLast ? onAllowSend : undefined);
  });
}

function initFileUpload(): void {
  const handleDocumentFileEvent = (e: Event): void => {
    if (!isTargetDomain()) return;
    const input = findFileInputFromEvent(e);
    if (!input) {
      if (e.target && (e.target as HTMLInputElement).type === 'file') {
        console.log('[AI-Aware SSE] file change/input 이벤트 수신했으나 files 없음:', (e.target as HTMLInputElement).id || '(no id)');
      }
      return;
    }
    const first = input.files?.[0];
    const firstType = first ? first.type || first.name?.split('.').pop() : '';
    if (firstType && !firstType.startsWith('image/')) {
      console.log('[AI-Aware SSE] file change 수신 (이미지 아님):', first?.name, firstType);
    }
    handleFileSelect(input, e);
  };

  // 1) document 레벨 change + input (일부 사이트는 input 이벤트만 발생)
  document.addEventListener('change', handleDocumentFileEvent, true);
  document.addEventListener('input', handleDocumentFileEvent, true);

  // 2) 현재 문서 + Shadow 내 모든 file input에 직접 리스너 (동적 추가·Shadow DOM 대응)
  function scanAndAttach(): void {
    attachFileInputListeners(document);
  }

  scanAndAttach();
  setTimeout(scanAndAttach, 500);
  setTimeout(scanAndAttach, 2000);

  let scanDebounce: ReturnType<typeof setTimeout> | null = null;
  function scheduleScan(): void {
    if (scanDebounce) clearTimeout(scanDebounce);
    scanDebounce = setTimeout(() => {
      scanDebounce = null;
      scanAndAttach();
    }, 50);
  }

  // 3) "첨부/파일/업로드" 클릭 시 file input이 곧바로 생기는 경우 대비 (해당 버튼 클릭 시에만 스캔)
  document.addEventListener(
    'click',
    (e) => {
      if (!isTargetDomain()) return;
      const el = (e.target as HTMLElement)?.closest?.('button, [role="button"], a, [data-testid]');
      if (!el) return;
      const label =
        el.getAttribute?.('aria-label') ??
        el.getAttribute?.('title') ??
        (el as HTMLElement).textContent ??
        '';
      if (!ATTACH_KEYWORDS.test(label)) return;
      scanAndAttach();
      [10, 50, 150, 400].forEach((ms) => setTimeout(scanAndAttach, ms));
    },
    true,
  );

  function startObserving(): void {
    scanAndAttach();
    // 모달/레이지 UI 대비: 초기 로드 후에도 몇 번 더 스캔
    [100, 400, 1000, 2500].forEach((ms) => setTimeout(scanAndAttach, ms));
    const observer = new MutationObserver(scheduleScan);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['type'] });
  }

  if (document.body) {
    startObserving();
  } else {
    document.addEventListener('DOMContentLoaded', startObserving);
  }
}

// ---- DOM 검증 (사이트별 선택자·첨부파일 탐지 확인) ----
/** 모든 input[type=file] 수집 (Shadow DOM 포함) */
function collectAllFileInputs(root: Document | ShadowRoot, inShadow = false): Array<{ input: HTMLInputElement; id: string; name: string; filesLength: number; inShadow: boolean; hasListener: boolean }> {
  const out: Array<{ input: HTMLInputElement; id: string; name: string; filesLength: number; inShadow: boolean; hasListener: boolean }> = [];
  const inputs = root.querySelectorAll('input[type="file"]');
  inputs.forEach((el) => {
    if (!(el instanceof HTMLInputElement)) return;
    out.push({
      input: el,
      id: el.id || '(no id)',
      name: el.name || '(no name)',
      filesLength: el.files?.length ?? 0,
      inShadow,
      hasListener: !!(el as unknown as { __sseListener?: boolean }).__sseListener,
    });
  });
  root.querySelectorAll('*').forEach((el) => {
    if (el.shadowRoot) {
      collectAllFileInputs(el.shadowRoot, true).forEach((r) => out.push(r));
    }
  });
  return out;
}

/** 사이트별 DOM 검증 결과를 콘솔에 출력. 페이지 로드 시 1회만 자동 실행 */
function runDomDiagnostic(): void {
  const domain = getDomain();
  const config = getSiteConfig(domain);
  const composer = getComposerElement();
  const sendBtn = findSendButton();
  const form = sendBtn?.closest('form') ?? document.querySelector('form');
  const attachmentCount = getAttachmentCount(form ?? null);
  const fileInputWithFiles = findFileInputWithFiles(form ?? null) ?? findFileInputWithFiles(null);
  const allFileInputs = collectAllFileInputs(document);

  const summary: Record<string, unknown> = {
    domain,
    siteConfig: config ? getHostKeyForDiagnostic(domain) : '(없음, 휴리스틱 사용)',
    composer: composer
      ? { id: (composer as HTMLElement).id || null, className: (composer.className as string)?.slice(0, 60) || null, tag: composer.tagName }
      : 'NOT FOUND',
    sendButton: sendBtn ? { tag: sendBtn.tagName, ariaLabel: sendBtn.getAttribute?.('aria-label') || null } : 'NOT FOUND',
    attachmentCount,
    fileInputWithFiles: fileInputWithFiles ? { id: fileInputWithFiles.id, filesLength: fileInputWithFiles.files?.length ?? 0 } : null,
    allFileInputsCount: allFileInputs.length,
  };
  if (config?.attachmentItemSelectors?.length) {
    (summary as Record<string, number>)['attachmentItemSelectorsMatch'] = countAttachmentsByItemSelectors(
      document,
      config.attachmentItemSelectors,
    );
  }
  if (config?.attachmentContainer?.length) {
    (summary as Record<string, number>)['attachmentContainerMatch'] = countAttachmentsFromDOM(
      document,
      config.attachmentContainer,
    );
  }
  console.log('[AI-Aware SSE] DOM 검증 결과', summary);
  if (allFileInputs.length > 0) {
    console.log(
      '[AI-Aware SSE] file input 목록',
      allFileInputs.map((r) => ({ id: r.id, name: r.name, filesLength: r.filesLength, inShadow: r.inShadow, listenerAttached: r.hasListener })),
    );
  }
  return;
}

function getHostKeyForDiagnostic(hostname: string): string | null {
  if (hostname === 'claude.ai' || hostname.endsWith('.anthropic.com')) return 'claude.ai';
  if (hostname.endsWith('.chatgpt.com')) return 'chatgpt.com';
  if (hostname.includes('gemini.google.com')) return 'gemini.google.com';
  return hostname;
}

/**
 * AI 검증용 HTML 덤프. 콘솔에서 __SSE_DUMP_HTML_FOR_VERIFICATION() 호출 후
 * 출력된 문자열을 ChatGPT/Claude/Gemini에 붙여넣으면 선택자를 정확히 분석해 줌.
 * 탐지·이벤트가 부정확할 때 실제 DOM 기준으로 선택자 보정 가능.
 */
function runHtmlDumpForVerification(): string {
  const domain = getDomain();
  const config = getSiteConfig(domain);
  const composer = getComposerElement();
  const sendBtn = findSendButton();
  const form = sendBtn?.closest('form') ?? document.querySelector('form');
  const parts: string[] = [];

  parts.push(`=== AI-Aware SSE: HTML 덤프 (${domain}) ===`);
  parts.push(`현재 siteConfig 키: ${getHostKeyForDiagnostic(domain) ?? domain}\n`);

  if (config) {
    parts.push('--- 현재 CONFIG (해당 사이트) ---');
    parts.push(JSON.stringify({ composer: config.composer, sendButton: config.sendButton, attachmentContainer: config.attachmentContainer, attachmentItemSelectors: config.attachmentItemSelectors }, null, 2));
    parts.push('');
  }

  parts.push('--- [1] Composer (입력 영역) ---');
  if (composer) {
    const parent = composer.parentElement;
    parts.push(parent ? `<!-- parent -->\n${parent.outerHTML.slice(0, 8000)}${parent.outerHTML.length > 8000 ? '\n... (truncated)' : ''}` : composer.outerHTML.slice(0, 6000));
  } else {
    parts.push('(NOT FOUND)');
  }
  parts.push('');

  parts.push('--- [2] Send Button (전송 버튼) ---');
  if (sendBtn) {
    const parent = sendBtn.parentElement;
    parts.push(parent ? `<!-- parent -->\n${parent.outerHTML.slice(0, 4000)}${parent.outerHTML.length > 4000 ? '\n... (truncated)' : ''}` : sendBtn.outerHTML);
  } else {
    parts.push('(NOT FOUND)');
  }
  parts.push('');

  parts.push('--- [3] Attachment 영역 ---');
  if (config?.attachmentContainer?.length) {
    const container = queryBySelectors(document, config.attachmentContainer);
    if (container) {
      parts.push(`<!-- attachmentContainer -->\n${container.outerHTML.slice(0, 6000)}${container.outerHTML.length > 6000 ? '\n... (truncated)' : ''}`);
    } else {
      parts.push('(container NOT FOUND by attachmentContainer selectors)');
    }
  }
  if (config?.attachmentItemSelectors?.length && composer) {
    const items = composer.querySelectorAll(config.attachmentItemSelectors.join(', '));
    parts.push(`\nattachmentItemSelectors 매칭 개수: ${items.length}`);
    items.forEach((el, i) => {
      parts.push(`\n<!-- item ${i + 1} -->\n${el.outerHTML.slice(0, 1500)}`);
    });
  }
  if (!config?.attachmentContainer?.length && !config?.attachmentItemSelectors?.length) {
    parts.push('(CONFIG에 attachment 설정 없음)');
  }
  parts.push('');
  parts.push('--- 위 HTML과 CONFIG를 ChatGPT/Claude/Gemini에 붙여넣고, composer / sendButton / attachment 선택자가 올바른지 검증·수정 제안을 요청하세요. ---');

  const full = parts.join('\n');
  console.log('[AI-Aware SSE] HTML 덤프 (아래 블록 전체를 복사해 AI에 붙여넣기):\n', full);
  try {
    navigator.clipboard.writeText(full);
    console.log('[AI-Aware SSE] 클립보드에 복사됨. AI 채팅창에 Ctrl+V로 붙여넣으세요.');
  } catch {
    console.log('[AI-Aware SSE] 클립보드 복사 실패. 위 로그에서 직접 복사하세요.');
  }
  return full;
}

// ---- Init ----
function init(): void {
  if (!isTargetDomain()) return;
  const frameLabel = typeof window !== 'undefined' && window !== window.top ? ' (iframe)' : '';
  console.log('[AI-Aware SSE] Content script 로드됨:', window.location.hostname + frameLabel);
  initPaste();
  initDrop();
  initSubmit();
  initFileUpload();
  // DOM 검증: 페이지 로드 시 1회만 (SPA 렌더 대기 후)
  setTimeout(runDomDiagnostic, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
