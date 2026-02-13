/**
 * 사이트별 명시적 선택자 설정 (휴리스틱 대신 사용).
 * 각 호스트에 대해 "어디가 입력창/전송 버튼/첨부 목록인지"를 지정하면
 * 그 선택자로만 탐지하고, 없으면 기존 휴리스틱으로 fallback.
 *
 * 새 사이트 추가 시: 해당 페이지에서 개발자도구로 요소를 검사한 뒤
 * selector를 채워 넣으면 됨.
 *
 * --- ChatGPT / Claude에 검증 요청하기 ---
 * 1) 이 파일 전체 또는 CONFIG 중 검증할 사이트 블록(예: 'chatgpt.com' {...})을 복사한다.
 * 2) 해당 사이트(chatgpt.com, claude.ai 등)에서 개발자도구(F12) → Elements에서
 *    채팅 입력 영역·전송 버튼·첨부 영역을 감싼 HTML 일부를 복사한다.
 * 3) ChatGPT 또는 Claude에 아래 프롬프트와 함께 붙여넣어 검증을 요청한다.
 *
 * [프롬프트 템플릿]
 * ---
 * 아래는 브라우저 확장용 사이트 설정(site-config)입니다. "CONFIG"와 "실제 DOM 일부"를 주었을 때,
 * 각 선택자(composer, sendButton, attachmentContainer, attachmentItemSelectors)가
 * DOM에서 올바른 요소를 가리키는지 검증해 주세요.
 * - composer: 메시지 입력 영역(textarea 또는 contenteditable)이어야 함.
 * - sendButton: 전송 버튼 하나만 매칭되어야 함.
 * - attachmentContainer 또는 attachmentItemSelectors: 첨부 파일/이미지가 있을 때만 매칭되거나, 첨부 개수를 자식 수로 셀 수 있어야 함.
 * 잘못된 선택자, 누락된 선택자, 더 견고한 선택자 제안을 알려 주세요.
 *
 * [CONFIG]
 * (여기에 이 파일의 CONFIG 객체 또는 해당 사이트 블록 붙여넣기)
 *
 * [실제 DOM 일부]
 * (여기에 개발자도구에서 복사한 HTML 붙여넣기)
 * ---
 */
export type SiteSelectors = {
  /** 메시지 입력 영역 (textarea 또는 contenteditable) */
  composer: string[];
  /** 전송 버튼 (정확히 하나 매칭되도록) */
  sendButton: string[];
  /**
   * 첨부된 파일을 보여주는 컨테이너.
   * 이 요소의 자식 개수로 "첨부 개수"를 판단.
   */
  attachmentContainer?: string[];
  /**
   * (ChatGPT 등) 첨부가 composer 내부에 img 등으로 들어가는 경우.
   * 이 선택자로 매칭되는 요소 개수 = 첨부 개수. attachmentContainer보다 우선.
   */
  attachmentItemSelectors?: string[];
};

const CONFIG: Record<string, SiteSelectors> = {
  'claude.ai': {
    // DOM: contenteditable div [data-testid="chat-input"], role=textbox, class tiptap ProseMirror
    composer: [
      '[data-testid="chat-input"]',
      '[data-chat-input-container="true"] [contenteditable="true"]',
      '[role="textbox"][contenteditable="true"]',
    ],
    sendButton: [
      '[data-chat-input-container="true"] button[aria-label="Send"]',
      '[data-chat-input-container="true"] button[aria-label="전송"]',
      '[data-chat-input-container="true"] button[aria-label="Send message"]',
      '[data-chat-input-container="true"] button[type="submit"]',
      'button[aria-label="Send"]',
      'button[aria-label="전송"]',
      'form button[type="submit"]',
    ],
    // 첨부 목록: data 속성 우선(Tailwind 클래스는 UI 변경 시 깨질 수 있음). 실제 DOM에서 data-testid 확인 후 보강
    attachmentContainer: [
      '[data-chat-input-container="true"] [data-testid="attachment-list"]',
      '[data-chat-input-container="true"] [data-attachments]',
      '[data-chat-input-container="true"] div.flex.flex-row.gap-3',
      '[data-chat-input-container="true"] .flex.flex-row',
      '[class*="attachment"]',
    ],
  },
  // ChatGPT: form data-type="unified-composer", #prompt-textarea(ProseMirror), 이미지는 composer 내부에 <img>로 삽입
  'chatgpt.com': {
    composer: [
      '#prompt-textarea',
      'form[data-type="unified-composer"] [contenteditable="true"]',
      '[data-id="root"][contenteditable="true"]',
      'form [contenteditable="true"]',
    ],
    sendButton: [
      'button[data-testid="send-button"]',
      'button[aria-label="Send message"]',
      'form[data-type="unified-composer"] button[type="submit"]',
      'form button[type="submit"]',
    ],
    // img와 [data-attachment] 중복 방지: data-attachment 있으면 그것만, 없으면 img (Set으로도 중복 제거되지만 선택자로 명확히)
    attachmentItemSelectors: [
      '#prompt-textarea [data-attachment]',
      '#prompt-textarea img:not([data-attachment])',
    ],
    attachmentContainer: [
      '[data-attachment]',
      '[class*="attachment"]',
    ],
  },
  // Gemini (Angular): ql-editor contenteditable. 다국어 대응으로 aria-label(한국어) 의존 낮춤
  'gemini.google.com': {
    composer: [
      'div.ql-editor[contenteditable="true"]',
      '[class*="ql-editor"][contenteditable="true"]',
      '.text-input-field [contenteditable="true"]',
      '.ql-editor.textarea',
      '[aria-label="여기에 프롬프트 입력"]',
    ],
    sendButton: [
      'button[type="submit"]',
      '[aria-label*="전송"]',
      '[aria-label*="Send"]',
      '.input-area-container button',
    ],
    // 첨부 있을 때만 .attachment-preview-wrapper에 자식이 있음; with-file-preview 클래스도 함께 붙음
    attachmentContainer: [
      '.attachment-preview-wrapper',
      '.with-file-preview .attachment-preview-wrapper',
      '[class*="xapfileselectordropzone"].with-file-preview',
    ],
  },
};

function getHostKey(hostname: string): string | null {
  if (CONFIG.hasOwnProperty(hostname)) return hostname;
  if (hostname.endsWith('.anthropic.com')) return 'claude.ai'; // 같은 설정 재사용
  if (hostname.endsWith('.chatgpt.com')) return 'chatgpt.com';
  if (hostname.includes('gemini.google.com')) return 'gemini.google.com';
  return null;
}

/**
 * 현재 도메인에 대한 사이트 설정.
 * 없으면 null (content 쪽에서 휴리스틱 fallback).
 */
export function getSiteConfig(hostname: string): SiteSelectors | null {
  const key = getHostKey(hostname);
  return key ? CONFIG[key] : null;
}

/**
 * root 아래에서 selector로 첫 매칭 요소 반환. Shadow DOM 재귀 탐색 (maxDepth 단계).
 */
function queryInShadowDeep(
  root: Document | ShadowRoot | Element,
  selector: string,
  maxDepth: number,
): Element | null {
  if (maxDepth <= 0) return null;
  try {
    const el = root.querySelector(selector);
    if (el) return el;
  } catch {}
  if (root instanceof Element && root.shadowRoot) {
    const inShadow = root.shadowRoot.querySelector(selector);
    if (inShadow) return inShadow;
    for (const child of root.shadowRoot.querySelectorAll('*')) {
      if (child.shadowRoot) {
        const found = queryInShadowDeep(child.shadowRoot, selector, maxDepth - 1);
        if (found) return found;
      }
    }
  }
  if (root instanceof Document) {
    for (const child of root.querySelectorAll('*')) {
      if (child.shadowRoot) {
        const found = queryInShadowDeep(child.shadowRoot, selector, maxDepth - 1);
        if (found) return found;
      }
    }
  }
  return null;
}

const SHADOW_DOM_MAX_DEPTH = 3;

/**
 * root(또는 document) 아래에서 selector 배열 순서대로 시도해 처음 매칭되는 요소 반환.
 * Shadow DOM은 재귀 탐색(maxDepth=3)으로 중첩 구조 대응.
 */
export function queryBySelectors(
  root: Document | ShadowRoot | Element,
  selectors: string[],
): Element | null {
  for (const sel of selectors) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      // invalid selector
    }
  }
  for (const sel of selectors) {
    const el = queryInShadowDeep(root, sel, SHADOW_DOM_MAX_DEPTH);
    if (el) return el;
  }
  return null;
}

/**
 * attachmentItemSelectors로 "첨부 개수" 판단 (ChatGPT 등 composer 내부 img).
 * 각 선택자로 매칭되는 요소를 합산(중복 제거)하여 반환.
 * 범위를 root로 한정 (doc 전체 검색 시 히스토리/숨김 composer 등 다른 영역 img까지 잡혀 과다 카운트될 수 있음).
 */
export function countAttachmentsByItemSelectors(
  root: Document | Element,
  itemSelectors: string[],
): number {
  const set = new Set<Element>();
  for (const sel of itemSelectors) {
    try {
      root.querySelectorAll(sel).forEach((el) => set.add(el));
    } catch {}
  }
  return set.size;
}

/**
 * 직계 자식이 "파일 첨부 칩"인지 판별 (파일명/미리보기/삭제 버튼 등 패턴).
 * name.length > 0만 쓰면 공백·아이콘만 있는 노드까지 포함되므로 더 구체적 패턴 사용.
 */
function isFileChipLike(el: Element): boolean {
  const hasFileName =
    el.querySelector('[class*="filename"], .file-name, [data-filename], [class*="file-name"]') != null;
  const hasPreview =
    el.querySelector('img[src], [class*="preview"], [class*="Preview"]') != null;
  const hasCloseBtn =
    el.querySelector(
      'button[aria-label*="Remove"], button[aria-label*="삭제"], button[aria-label*="remove"], [aria-label*="Remove"]',
    ) != null;
  if (hasFileName || hasPreview || hasCloseBtn) return true;
  const tag = el.tagName.toLowerCase();
  const role = el.getAttribute?.('role');
  if (tag === 'li' || role === 'listitem') return true;
  if (el.querySelector('img[src], [type="file"]') != null) return true;
  return false;
}

/** 실제로 화면에 보이는 요소인지 (공백만 있는 div 등 제외) */
function isVisible(el: Element): boolean {
  try {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0;
  } catch {
    return true;
  }
}

/**
 * attachmentContainer 선택자로 "첨부 개수" 판단.
 * 컨테이너의 직계 자식 중 파일 칩 패턴이면서 보이는 요소만 카운트.
 */
export function countAttachmentsFromDOM(
  root: Document | Element,
  containerSelectors: string[],
): number {
  const container = queryBySelectors(root, containerSelectors);
  if (!container) return 0;
  const children = Array.from(container.children);
  return children.filter((el) => isFileChipLike(el) && isVisible(el)).length;
}
