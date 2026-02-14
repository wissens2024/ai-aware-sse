# AI-Aware SSE PoC 시연 가이드

Chrome Extension을 이용한 사용자 테스트 시나리오.
아래 샘플을 AI 서비스(ChatGPT, Claude, Gemini 등)에 붙여넣어 탐지·차단·마스킹 동작을 확인한다.

---

## 사전 준비

1. Chrome Extension 설치 → 옵션에서 API Base URL, Device Token 설정
2. Backend 서버 가동, DB 시드 적용
3. Admin Console 접속 가능 확인 (이벤트/승인/정책 조회용)

---

## 시연 1: 일반 텍스트는 통과

민감정보가 없는 일반 업무 텍스트는 아무 제약 없이 전송된다.

```
안녕하세요. 내일 오전 10시 회의실 B에서 프로젝트 진행 현황 회의가 있습니다.
참석 부탁드립니다. 안건은 3분기 마케팅 전략 검토입니다.
```

**기대 동작**: 모달 없이 정상 전송됨.
**Admin 확인**: Events에 ALLOW로 기록.

---

## 시연 2: 개인정보(PII) 차단

개인정보가 포함된 텍스트를 붙여넣으면 즉시 차단된다.

```
문의 드립니다.
담당자: 홍길동, 연락처 010-1234-5678, 이메일 hong@example.com
주민번호 900101-1234567 확인 부탁합니다.
```

**기대 동작**: BLOCK 모달 — "개인정보가 포함되어 전송이 차단되었습니다."
**탐지 항목**: 이름(홍길동), 휴대전화, 이메일, 주민등록번호 = 4건

---

## 시연 3: 비밀키·토큰 차단

API 키, 액세스 토큰 등 Secrets가 포함되면 차단된다.

```
아래 키로 API 연동하면 됩니다.
api_key: sk-proj-abc123def456ghi789jklmnop
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkw
```

**기대 동작**: BLOCK 모달 — "비밀키/토큰이 포함되어 전송이 차단되었습니다."

---

## 시연 4: 마스킹 후 전송

PII Mask 정책을 활성화하면 개인정보를 자동 마스킹하여 전송한다.

> **사전 설정**: Admin → Policies에서 "PII Mask Partial" 정책을 활성화

```
담당자 홍길동(1990-01-15), 연락처 010-1234-5678, 이메일 hong@example.com 으로 연락 주세요.
```

**기대 동작**: 마스킹 안내 모달 후, 아래와 같이 변환되어 AI에 전송됨.
```
담당자 홍**(1990-**-**), 연락처 010-****-5678, 이메일 hong@***.*** 으로 연락 주세요.
```

---

## 시연 5: 승인 요청 흐름

차단된 상태에서 "승인 요청"을 보내면 관리자가 Admin에서 승인/거절할 수 있다.

1. 시연 2 또는 3의 텍스트를 붙여넣어 **BLOCK** 모달을 띄운다
2. 모달에서 **"승인 요청"** 버튼 클릭 → "요청이 접수되었습니다" 표시
3. Admin → **Approvals** → 대기 건 확인 → **승인** 클릭
4. Extension이 자동으로 승인 결과를 수신 → 사용자가 재전송 가능

---

## 시연 6: 오탐 없음 — 일반 비즈니스 한글 텍스트

한국어 일반 문장은 이름으로 오탐하지 않는다. "현실", "고객", "인형" 등 성씨와 동일한 첫 글자가 있어도 문맥 없이는 탐지하지 않음.

```
현실적인 방안을 모색하여 고객 서비스를 개선하고, 인형 사업부와
방송 콘텐츠 팀의 협업 체계를 구축합니다. 연산 최적화를 통해
고성능 배치 처리 시스템을 완성할 예정입니다.
```

**기대 동작**: 모달 없이 정상 전송됨. PII 탐지 0건.

---

## 시연 7: 12종 PII 전체 탐지

모든 종류의 개인정보가 포함된 텍스트로 전체 탐지 능력을 시연한다.

```
[직원 정보]
이름: 홍길동
주민등록번호: 900101-1234567
휴대전화: 010-1234-5678
사무실: 02-987-6543
이메일: hong@example.com
운전면허: 11-12-123456-78
사업자등록번호: 123-45-67890
카드번호: 1234-5678-9012-3456
생년월일: 1990-01-15
주소: 서울특별시 강남구 역삼동 123번지
여권번호: M12345678
계좌: 국민은행 110-234-567890
```

**기대 동작**: BLOCK — 11건+ PII 탐지.

| # | 패턴 | 탐지 대상 | 마스킹 결과 |
|---|------|-----------|------------|
| 1 | 주민등록번호 | `900101-1234567` | `900101-*******` |
| 2 | 휴대전화 | `010-1234-5678` | `010-****-5678` |
| 3 | 일반전화 | `02-987-6543` | `02-****-6543` |
| 4 | 이메일 | `hong@example.com` | `hong@*******.***` |
| 5 | 여권번호 | `M12345678` | (탐지만, 마스킹 미구현) |
| 6 | 운전면허 | `11-12-123456-78` | `11-**-******-**` |
| 7 | 사업자등록번호 | `123-45-67890` | `123-**-*****` |
| 8 | 카드번호 | `1234-5678-9012-3456` | `1234-****-****-3456` |
| 9 | 계좌번호 | `110-234-567890` | (탐지만, 마스킹 미구현) |
| 10 | 주소 | `서울특별시 강남구...` | (탐지만, 마스킹 미구현) |
| 11 | 이름 | `홍길동` | `홍**` |

---

## 시연 8: 실무 시나리오 — 고객 문의 응대

실제 업무에서 발생할 수 있는 상황. CS 담당자가 AI에 고객 정보를 붙여넣는 경우.

```
[고객 문의 #2024-1234]
고객명: 김영희님
연락처: 010-9876-5432
이메일: younghee.kim@company.co.kr

문의 내용: 지난달 결제한 카드번호 9876-5432-1098-7654 건에 대해
환불 처리를 요청하셨습니다. 계좌 우리은행 1002-345-678901 로
환불해 달라고 하셨습니다.
```

**기대 동작**: BLOCK — 이름, 전화번호, 이메일, 카드번호, 계좌번호 탐지.

> 이 시나리오는 "AI에게 고객 상담 요약을 부탁하려다 개인정보가 유출되는 상황"을 보여준다.

---

## 시연 9: 실무 시나리오 — 인사 데이터

HR 담당자가 AI에 직원 목록을 붙여넣는 경우.

```
[신입사원 명단]
1. 이름: 박지성, 주민번호: 850101-1234567, 연락처: 010-1111-2222
2. 성명: 손흥민, 주민번호: 920707-1234567, 연락처: 010-3333-4444
3. 담당자: 김연아, 주민번호: 900919-2234567, 연락처: 010-5555-6666
```

**기대 동작**: BLOCK — 이름 3건, 주민번호 3건, 전화번호 3건 = 9건+ 탐지.

---

## 시연 10: 실무 시나리오 — 소스코드 대량 붙여넣기

> **사전 설정**: Extension Options에서 그룹을 **Dev**로 설정

개발자가 1500자 이상의 소스코드를 AI에 붙여넣는 경우 경고(WARN).

```
import React, { useState, useEffect } from 'react';

interface User {
  id: number;
  name: string;
  email: string;
}

function UserList() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/users')
      .then(res => res.json())
      .then(data => { setUsers(data); setLoading(false); })
      .catch(err => console.error(err));
  }, []);

  if (loading) return <div>Loading...</div>;

  return (
    <div className="user-list">
      <h2>User Management</h2>
      <table>
        <thead>
          <tr><th>ID</th><th>Name</th><th>Email</th></tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td>{u.id}</td>
              <td>{u.name}</td>
              <td>{u.email}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default UserList;

// Utility functions for data processing
function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

function debounce<T extends (...args: any[]) => void>(fn: T, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: Parameters<T>) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || '/api',
  timeout: 5000,
  retryCount: 3,
  pagination: { defaultSize: 20, maxSize: 100 },
};

class ApiClient {
  private baseUrl: string;
  constructor(baseUrl: string) { this.baseUrl = baseUrl; }
  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
  async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }
}

export { UserList, formatDate, debounce, ApiClient };
```

**기대 동작**: WARN 모달 — "코드/대량 텍스트로 보입니다. 민감정보가 없는지 확인 후 진행하세요."
- "계속 진행" 클릭 → 텍스트 삽입
- "취소" 클릭 → 삽입 취소

---

## 시연 순서 추천 (PoC 데모)

| 순서 | 시연 | 핵심 메시지 | 소요 |
|------|------|-------------|------|
| 1 | 시연 1 (일반 텍스트) | "정상 업무는 방해하지 않습니다" | 30초 |
| 2 | 시연 6 (오탐 없음) | "한글 일반 문장을 오탐하지 않습니다" | 30초 |
| 3 | 시연 2 (PII 차단) | "개인정보가 포함되면 즉시 차단합니다" | 1분 |
| 4 | 시연 3 (Secrets 차단) | "API 키, 토큰도 차단합니다" | 30초 |
| 5 | 시연 4 (마스킹) | "차단 대신 마스킹하여 전송할 수도 있습니다" | 1분 |
| 6 | 시연 7 (12종 전체) | "한국형 개인정보 12종을 모두 탐지합니다" | 1분 |
| 7 | 시연 8 (고객 문의) | "실제 업무에서 이렇게 유출될 수 있습니다" | 1분 |
| 8 | 시연 5 (승인 흐름) | "필요 시 관리자 승인 후 전송할 수 있습니다" | 2분 |
| 9 | 시연 10 (소스코드) | "소스코드 대량 붙여넣기도 경고합니다" | 1분 |
| | | **합계** | **~8분** |
