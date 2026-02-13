import type { DecisionResponse } from './api';

const STYLE = `
  position: fixed; z-index: 2147483647;
  top: 50%; left: 50%; transform: translate(-50%, -50%);
  min-width: 320px; max-width: 420px;
  background: #fff; border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,.25);
  font-family: system-ui, -apple-system, sans-serif;
  font-size: 14px; line-height: 1.5;
  padding: 20px; border: 1px solid #e5e7eb;
`;
const OVERLAY_STYLE = `
  position: fixed; inset: 0; z-index: 2147483646;
  background: rgba(0,0,0,.4);
`;

export type ModalAction = 'allow' | 'block' | 'request_approval' | 'continue' | 'cancel';
export type ModalActionPayload = { request_reason?: string };

export function showDecisionModal(
  response: DecisionResponse,
  onAction: (action: ModalAction, payload?: ModalActionPayload) => void,
): void {
  const overlay = document.createElement('div');
  overlay.setAttribute('style', OVERLAY_STYLE);
  overlay.id = 'ai-aware-sse-modal-overlay';

  const box = document.createElement('div');
  box.setAttribute('style', STYLE);
  box.id = 'ai-aware-sse-modal-box';

  const outcome = response.outcome;
  const message = response.action?.message ?? response.explanation?.summary ?? '정책에 의해 제어됩니다.';
  const allowApproval = response.action?.allow_approval_request === true;

  const title =
    outcome === 'BLOCK'
      ? '전송 차단'
      : outcome === 'WARN'
        ? '경고'
        : outcome === 'REQUIRE_APPROVAL'
          ? '승인 필요'
          : '알림';

  const titleColor =
    outcome === 'BLOCK' ? '#dc2626' : outcome === 'WARN' ? '#d97706' : outcome === 'REQUIRE_APPROVAL' ? '#2563eb' : '#374151';

  box.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 8px; color: ${titleColor}">${title}</div>
    <p style="margin: 0 0 16px; color: #374151">${escapeHtml(message)}</p>
    <div id="ai-aware-sse-modal-buttons" style="display: flex; gap: 8px; justify-content: flex-end; flex-wrap: wrap;"></div>
  `;

  const buttons = box.querySelector('#ai-aware-sse-modal-buttons') as HTMLDivElement;

  function close() {
    overlay.remove();
    box.remove();
  }

  if (outcome === 'WARN') {
    const btnContinue = document.createElement('button');
    btnContinue.textContent = '계속 진행';
    btnContinue.style.cssText = 'padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 8px; cursor: pointer';
    btnContinue.onclick = () => {
      close();
      onAction('continue');
    };
    const btnCancel = document.createElement('button');
    btnCancel.textContent = '취소';
    btnCancel.style.cssText = 'padding: 8px 16px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; cursor: pointer';
    btnCancel.onclick = () => {
      close();
      onAction('cancel');
    };
    buttons.append(btnContinue, btnCancel);
  } else if (outcome === 'BLOCK' || outcome === 'REQUIRE_APPROVAL') {
    const btnClose = document.createElement('button');
    btnClose.textContent = '확인';
    btnClose.style.cssText = 'padding: 8px 16px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; cursor: pointer';
    btnClose.onclick = () => {
      close();
      onAction('block');
    };
    buttons.appendChild(btnClose);
    if (allowApproval && (outcome === 'BLOCK' || outcome === 'REQUIRE_APPROVAL')) {
      const btnApproval = document.createElement('button');
      btnApproval.textContent = '승인 요청';
      btnApproval.style.cssText = 'padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 8px; cursor: pointer';
      btnApproval.onclick = () => {
        showRequestReasonStep(box, overlay, (reason) => {
          close();
          onAction('request_approval', { request_reason: reason || undefined });
        }, close);
      };
      buttons.insertBefore(btnApproval, btnClose);
    }
  } else {
    const btnOk = document.createElement('button');
    btnOk.textContent = '확인';
    btnOk.style.cssText = 'padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 8px; cursor: pointer';
    btnOk.onclick = () => {
      close();
      onAction('allow');
    };
    buttons.appendChild(btnOk);
  }

  overlay.onclick = () => {
    close();
    onAction('cancel');
  };
  box.onclick = (e) => e.stopPropagation();

  document.body.appendChild(overlay);
  document.body.appendChild(box);
}

function escapeHtml(s: string): string {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showRequestReasonStep(
  box: HTMLDivElement,
  overlay: HTMLDivElement,
  onSubmit: (reason: string) => void,
  onCancel: () => void,
): void {
  const titleColor = '#2563eb';
  box.innerHTML = `
    <div style="font-weight: 600; margin-bottom: 8px; color: ${titleColor}">승인 요청 사유</div>
    <p style="margin: 0 0 12px; color: #6b7280; font-size: 13px">관리자 검토를 위해 요청 사유를 입력해 주세요.</p>
    <textarea id="ai-aware-sse-request-reason" placeholder="예: 고객 지원용으로 API 키 포함 문서 전송이 필요합니다." rows="3" style="width: 100%; padding: 10px; border: 1px solid #e5e7eb; border-radius: 8px; font-size: 14px; resize: vertical; box-sizing: border-box;"></textarea>
    <div id="ai-aware-sse-reason-buttons" style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;"></div>
  `;
  const textarea = box.querySelector('#ai-aware-sse-request-reason') as HTMLTextAreaElement;
  const btnContainer = box.querySelector('#ai-aware-sse-reason-buttons') as HTMLDivElement;
  const btnSubmit = document.createElement('button');
  btnSubmit.textContent = '요청하기';
  btnSubmit.style.cssText = 'padding: 8px 16px; background: #2563eb; color: #fff; border: none; border-radius: 8px; cursor: pointer';
  btnSubmit.onclick = () => onSubmit((textarea?.value ?? '').trim());
  const btnCancel = document.createElement('button');
  btnCancel.textContent = '취소';
  btnCancel.style.cssText = 'padding: 8px 16px; background: #e5e7eb; color: #374151; border: none; border-radius: 8px; cursor: pointer';
  btnCancel.onclick = () => onCancel();
  btnContainer.append(btnSubmit, btnCancel);
  textarea?.focus();
}
