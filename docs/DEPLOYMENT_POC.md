# PoC 배포 가이드 (서버 + 확장 프로그램)

PoC를 실제 사용자에게 제공하려면 **(1) 서버를 공인 IP/도메인에 배포**하고 **(2) 확장 프로그램을 사용자에게 배포**해야 합니다.

---

## 0. sse.aines.kr 배포 (Nginx 한 도메인)

**구성**: DB·Backend는 같은 서버에서 포트만 구분, **API와 Frontend는 Nginx 한 도메인**으로 제공.

- **URL**
  - Admin(프론트): `https://sse.aines.kr/`
  - API: `https://sse.aines.kr/api/v1/`
- **Nginx**: 프론트는 `/`(Next.js 프록시 또는 정적), API는 `/api/` → Backend(내부 8080) 프록시.

### Nginx 설정

- 예제: **[docs/nginx-sse.aines.kr.conf](nginx-sse.aines.kr.conf)**  
  - `location /api/` → `proxy_pass http://127.0.0.1:8080;` (Backend)
  - `location /` → `proxy_pass http://127.0.0.1:3000;` (Next.js) 또는 정적 `alias`로 서빙
- SSL: `ssl_certificate` 경로를 실제 인증서 경로로 수정 (예: Let's Encrypt).

### 환경 변수

| 구분 | 변수 | 값 |
|------|------|-----|
| Backend | `PORT` | `8080` (Nginx가 프록시하는 포트) |
| Backend | `CORS_ORIGINS` | `https://sse.aines.kr` |
| Backend | `DATABASE_URL`, `EXT_DEVICE_TOKEN` | 실제 값 |
| Frontend (빌드 시) | `NEXT_PUBLIC_API_BASE_URL` | `https://sse.aines.kr/api/v1` |

### 확장 프로그램

- 옵션 **API Base URL**: `https://sse.aines.kr/api/v1`
- `manifest.json`에 `https://sse.aines.kr/*` 이미 포함됨.

---

## 1. 서버 배포 (공인 IP 또는 도메인)

### 1.1 필요한 것

- **Backend API**: NestJS, 포트 8080 (또는 역방향 프록시 뒤)
- **Admin Console**: Next.js, 포트 3000 (또는 정적 빌드 후 같은 서버에서 서빙)
- **PostgreSQL**: DB (docker-compose 또는 별도 호스트)
- **공인 접근**: 공인 IP 또는 도메인 + HTTPS 권장

### 1.2 환경 변수 (Backend)

| 변수 | 설명 | 예시 |
|------|------|------|
| `PORT` | API 리스닝 포트 | `8080` |
| `NODE_ENV` | `production` 권장 | `production` |
| `DATABASE_URL` | PostgreSQL 연결 문자열 | `postgresql://sse_app:비밀번호@호스트:5432/sse_db` |
| `EXT_DEVICE_TOKEN` | 확장 프로그램 인증용 토큰 (사용자에게 공유) | PoC용 비밀값 |
| `CORS_ORIGINS` | Admin 등 추가 허용 Origin (쉼표 구분) | `https://admin.yourcompany.com,https://poc.yourcompany.com` |

- 로컬 개발 시에는 `CORS_ORIGINS` 없이 localhost만 허용됨.
- PoC 서버에서 Admin을 `https://admin.yourcompany.com` 에 두었다면  
  `CORS_ORIGINS=https://admin.yourcompany.com` 로 설정.

### 1.3 배포 형태 예시

**A. 단일 VM + Docker Compose**

- `docker-compose.yml`로 Postgres + Backend(이미지 또는 호스트에서 실행) 구성.
- Nginx(또는 Caddy)를 앞에 두고:
  - `https://api.yourcompany.com` → Backend 8080
  - `https://admin.yourcompany.com` → Admin(Next.js 빌드 결과 또는 Node 서버)
- VM에 공인 IP 또는 도메인 연결.

**B. Backend만 Docker, Admin은 Vercel 등**

- Backend: VM/클라우드에 Docker로 API + DB.
- Admin: `frontend-admin`을 Vercel 등에 배포 시  
  `NEXT_PUBLIC_API_BASE_URL=https://api.yourcompany.com/api/v1` 설정.
- Backend `CORS_ORIGINS`에 Admin 배포 URL 추가 (예: `https://your-admin.vercel.app`).

**C. 수동 실행 (개발/소규모 PoC)**

- 서버에서 PostgreSQL 실행 후:
  - `cd backend && pnpm run start:prod` (또는 `node dist/main`)
  - `cd frontend-admin && pnpm run build && pnpm run start` (또는 정적 export 후 웹서버)
- 방화벽에서 8080, 3000(또는 사용 포트) 개방.

### 1.4 Admin Console API URL

- Admin이 Backend를 부르므로 빌드 시 또는 런타임에 API Base URL 필요.
- `frontend-admin`: `NEXT_PUBLIC_API_BASE_URL` 사용.
- PoC 서버 기준 예: `NEXT_PUBLIC_API_BASE_URL=https://api.yourcompany.com/api/v1`

---

## 2. 확장 프로그램(Extension) 배포

확장 프로그램은 **사용자 브라우저**에서 설치되며, 옵션에서 **서버 API Base URL**과 **Device Token**을 설정합니다.  
PoC용 배포 방식은 두 가지입니다.

---

### 2.1 방식 A: Chrome 웹 스토어 (공개/비공개)

- **공개**: 누구나 검색해 설치 가능.
- **비공개(Unlisted)**: 링크를 아는 사용자만 설치 가능. PoC에 적합.

**절차 요약**

1. **패키지 준비**
   - `extension/`에서 `pnpm run build` 실행.
   - `extension/` 폴더를 **zip**으로 압축 (루트에 `manifest.json`, `dist/`, `options.html` 등 포함, `node_modules` 제외).

2. **Chrome 웹 스토어 개발자 계정**
   - [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) 에서 개발자 등록 (일회성 등록비 있음).

3. **항목 생성 및 업로드**
   - "새 항목" → 위에서 만든 zip 업로드.
   - 스토어 설명, 카테고리, 스크린샷 등 입력.
   - 비공개로 두려면 "가시성"에서 **Unlisted** 선택 후 저장.

4. **검토 후 배포**
   - 검토 통과 후 "배포"하면 스토어 URL이 생성됨.
   - 사용자에게 **해당 URL**만 공유하면 설치 가능.

5. **PoC 시 사용자 안내**
   - 설치 후 확장 프로그램 **옵션**에서 다음 설정:
     - **API Base URL**: `https://api.yourcompany.com/api/v1` (실서버 주소)
     - **Device Token**: 운영팀이 공유한 토큰 (Backend `EXT_DEVICE_TOKEN`과 동일)

---

### 2.2 방식 B: 비패키지(개발자 모드) / 엔터프라이즈 정책

- 스토어를 쓰지 않고, **내부 사용자에게만** 배포할 때 사용.

**B-1. 개발자 모드로 로드 (소수 사용자)**

1. `extension/`에서 `pnpm run build`.
2. `extension/` 폴더를 사용자에게 전달 (zip, 공유 드라이브 등).
3. 사용자 안내:
   - Chrome 주소창에 `chrome://extensions` 입력.
   - 우측 상단 **개발자 모드** 켜기.
   - **압축해제된 확장 프로그램을 로드합니다** → `extension` 폴더 선택.
4. 확장 **옵션**에서 API Base URL, Device Token 입력.

- 단점: 사용자마다 폴더 경로 유지 필요, Chrome 재시작 시 “압축해제된 확장”이라 경고가 뜰 수 있음. PoC·내부용으로만 권장.

**B-2. 엔터프라이즈 정책 (Windows GPO / 관리 콘솔)**

- Chrome 정책으로 **강제 설치** 및 **설정 고정** 가능 (예: 회사 PC 일괄 배포).
- 확장 ID가 필요하므로, 한 번 스토어에 올려서 **비공개(Unlisted)** 로 두고, 정책으로 해당 ID를 설치하도록 설정하는 방식이 일반적.
- 또는 **내부 배포용 확장**을 스토어에 비공개로 올리고, 정책으로 설치 URL만 배포하는 방법도 가능.

---

## 3. manifest.json의 host_permissions (PoC 서버 도메인)

확장이 **실서버 API**에 fetch를 보내려면, 해당 도메인에 대한 `host_permissions`가 필요합니다.  
**sse.aines.kr** 사용 시에는 `https://sse.aines.kr/*` 가 이미 포함되어 있습니다.  
다른 도메인을 쓸 경우 `extension/manifest.json`의 `host_permissions`에 `https://도메인/*` 를 추가한 뒤 확장을 다시 빌드하면 됩니다.

---

## 4. 체크리스트 요약

| 단계 | 확인 사항 |
|------|-----------|
| 서버 | Backend가 공인 IP/도메인에서 동작 (HTTPS 권장) |
| 서버 | `DATABASE_URL`, `EXT_DEVICE_TOKEN`, `CORS_ORIGINS`(Admin URL) 설정 |
| Admin | `NEXT_PUBLIC_API_BASE_URL`가 실서버 API 주소로 빌드/설정됨 |
| Extension | `manifest.json`의 `host_permissions`에 실서버 API 도메인 추가 후 빌드 |
| Extension 배포 | 스토어(비공개) 또는 압축해제 로드 + 사용자에게 옵션 설정 안내 |
| 사용자 | 옵션에서 API Base URL = 실서버, Device Token = 운영팀 공유값 입력 |

위 순서대로 적용하면, 서버는 공인 IP/도메인으로 제공하고, 확장 프로그램은 선택한 방식(스토어 비공개 또는 내부 배포)으로 사용자에게 배포할 수 있습니다.
