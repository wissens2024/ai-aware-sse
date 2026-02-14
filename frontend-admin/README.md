# AI-Aware SSE Admin Console

Next.js 기반 관리자 콘솔. 정책 관리, 이벤트 조회, 승인 처리, 대시보드.

---

## 실행

```bash
pnpm install

# 개발
pnpm run dev          # http://localhost:3000

# 운영 빌드
pnpm run build
pnpm run start        # http://localhost:3000
```

## 환경변수 (.env.local)

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `NEXT_PUBLIC_API_BASE` | Backend API URL | `http://localhost:8080/api/v1` |

---

## 화면 구성

| 경로 | 화면 | 설명 |
|------|------|------|
| `/` | Dashboard | 기간별 메트릭, 상위 앱/탐지기 |
| `/events` | Events | 이벤트 목록 (기간 필터, AG Grid) |
| `/events/[id]` | Event Detail | 이벤트 상세 (메타/탐지결과/정책결정) |
| `/approvals` | Approvals | 승인 대기 목록 |
| `/approvals/[id]` | Approval Detail | 승인/거절 처리 |
| `/policies` | Policies | 정책 목록 |
| `/policies/[id]` | Policy Edit | 정책 편집 (조건/액션/마스킹 룰) |
| `/policies/new` | Policy Create | 정책 신규 생성 |
| `/users` | Users | 사용자 목록 |
| `/groups` | Groups | 그룹 목록 |
| `/audit` | Audit | 감사 로그 |
| `/exceptions` | Exceptions | 예외 관리 |

---

## 파일 구조

```
frontend-admin/src/
├── app/
│   ├── layout.tsx              # 루트 레이아웃 (AppShell + 테마 + 다국어)
│   ├── page.tsx                # Dashboard
│   ├── events/
│   │   ├── page.tsx            # Events 목록
│   │   └── [id]/page.tsx       # Event 상세
│   ├── approvals/
│   │   ├── page.tsx            # Approvals 목록
│   │   └── [id]/page.tsx       # Approval 처리
│   ├── policies/
│   │   ├── page.tsx            # Policies 목록
│   │   ├── [id]/page.tsx       # Policy 편집
│   │   └── new/page.tsx        # Policy 생성
│   ├── users/page.tsx
│   ├── groups/page.tsx
│   ├── audit/page.tsx
│   └── exceptions/page.tsx
├── components/
│   ├── AppShell.tsx            # 사이드바 + 헤더 레이아웃
│   ├── ThemeProvider.tsx       # 다크모드 (next-themes)
│   └── LanguageProvider.tsx    # 다국어 (ko/en)
└── lib/
    ├── api.ts                  # Backend API 통신 (fetchApi)
    ├── i18n.ts                 # 번역 리소스
    └── ag-grid-setup.ts        # AG Grid 설정
```

---

## 주요 라이브러리

| 라이브러리 | 용도 |
|-----------|------|
| Next.js 15 | 프레임워크 |
| React 19 | UI |
| AG Grid | 데이터 테이블 |
| Tailwind CSS | 스타일링 |
| next-themes | 다크모드 |
| lucide-react | 아이콘 |

---

## 배포

PM2로 프로세스 관리, GitHub Actions로 자동 배포.

```bash
pnpm install --frozen-lockfile
pnpm run build
pm2 restart sse-frontend
```
