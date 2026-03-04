# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-Aware SSE is a security system (PoC) that prevents sensitive data leakage to AI web services (ChatGPT, Claude, Copilot, Gemini). It intercepts paste/submit/upload events in the browser and enforces policies (ALLOW/WARN/BLOCK/MASK/REQUIRE_APPROVAL) via a backend policy engine. All decisions are audited.

Three components in a monorepo:
- **Backend** (`backend/`) - NestJS 11 API server, policy engine, Prisma ORM
- **Admin Console** (`frontend-admin/`) - Next.js 15 + React 19 management UI
- **Browser Extension** (`extension/`) - Chrome MV3 content script enforcement

## Common Commands

### Backend (`backend/`)
```bash
npm run start:dev        # Dev server with watch (:8080, Swagger at /api)
npm run build            # nest build
npm run test             # Jest unit tests
npm run test:watch       # Jest watch mode
npm run test:cov         # Coverage report
npm run test:e2e         # E2E tests (test/jest-e2e.json)
npm run lint             # ESLint with --fix
npm run format           # Prettier write
npm run prisma:generate  # Regenerate Prisma client after schema changes
```

### Admin Console (`frontend-admin/`)
```bash
npm run dev    # Dev server (:3000)
npm run build  # Next.js production build
npm run lint   # ESLint
```

### Extension (`extension/`)
```bash
npm run build  # esbuild → dist/ (content.js, background.js, options.js)
npm run watch  # Auto-rebuild on changes
```
Load `extension/dist` as unpacked extension in `chrome://extensions`.

### Database
```bash
docker compose up -d                    # Start PostgreSQL 16
# Init scripts in initdb/ run automatically on first start:
#   01_create_db_user.sql → 02_schema.sql → 03_seed.sql
```

## Architecture

### Data Flow
```
User action (paste/submit/upload) on AI site
  → Extension content.ts hooks the event, extracts metadata + SHA256 hash
  → POST /api/v1/extension/decision-requests (Bearer EXT_DEVICE_TOKEN)
  → ExtensionService → PolicyEngineService (scope match → condition eval → detector run)
  → DecisionResponse {outcome, risk_score, detector_hits, explanation}
  → Extension shows modal UI (warn/block/approval) or allows/masks content
```

### Backend Module Structure
- **`extension/`** - Endpoints for the browser extension (decision-requests, user-actions, approval-cases, ping). Protected by `ExtensionAuthGuard` (Bearer token from `EXT_DEVICE_TOKEN` env var).
- **`admin/`** - Admin console API: dashboard, events, approvals, policies, audit, users, groups, apps, exceptions. Each sub-feature has its own controller/service/module.
- **`policy/`** - `PolicyEngineService` evaluates policies by priority (lowest first). `PolicyCacheService` caches enabled policies per tenant in memory (TTL 1 min). Two-phase: scope matching (apps/groups/event_types) then condition evaluation (detector counts, content length, file ext/mime).
- **`detector/`** - Regex-based detection for PII, secrets, and code patterns. Runs server-side on `sample_masked` content.
- **`prisma/`** - Database client. All tables live in the `sse` PostgreSQL schema (not `public`).

### Database
PostgreSQL with all tables in the `sse` schema. Key models: `tenants`, `users`, `groups`, `policies`, `events`, `decisions`, `approval_cases`, `audit_trail`, `detector_configs`, `apps`, `app_domains`, `policy_exceptions`.

Multi-tenant via `tenant_id` on every table. The PoC hardcodes tenant lookup by `name = 'PoC Tenant'`.

### Admin Console
Next.js App Router. Korean-language UI (`lib/i18n.ts`). Uses ag-grid for data tables, Tailwind CSS for styling, next-themes for dark mode. API client in `lib/api.ts` calls `NEXT_PUBLIC_API_BASE_URL`.

### Extension
Chrome MV3. `content.ts` is the main content script that hooks paste/submit/upload events. `site-config.ts` defines per-domain DOM selectors (composer, send button, attachment input) for each AI service. `modal.ts` renders decision modals. `api.ts` handles backend communication. `transform.ts` applies mask/anonymize transforms.

## Key Design Decisions

- **No raw content stored** - Only hashes, lengths, masked samples, and detection results are persisted (privacy-first)
- **Policy evaluation order** - Lower `priority` field = evaluated first; first matching policy wins
- **Approval flow** - Extension polls backend every 5-15 seconds for approval status (WebSocket planned for later)
- **Content detection** - Two-pass: optional local detection in extension, then server-side detectors on `sample_masked` field
- **Event schema versioning** - `schema_version` field on events for future migration compatibility

## Environment Configuration

### Backend `.env`
- `PORT` (default: 8080)
- `DATABASE_URL` - PostgreSQL connection string with `?schema=sse`
- `EXT_DEVICE_TOKEN` - Bearer token for extension auth (PoC: `devtoken-123`)
- `CORS_ORIGINS` - Additional allowed origins (comma-separated)

### Frontend `.env.local`
- `NEXT_PUBLIC_API_BASE_URL` (default: `http://localhost:8080/api/v1`)

## API Structure

All endpoints prefixed with `/api/v1`. Swagger UI available at `/api` when backend is running.

- `/api/v1/extension/*` - Extension endpoints (auth via Bearer token)
- `/api/v1/admin/*` - Admin endpoints (dashboard, events, approvals, policies, audit, etc.)

## Code Style

- ESLint + Prettier across all packages
- Single quotes, trailing commas (backend `.prettierrc`)
- 2-space indentation
- Backend tests: Jest with ts-jest, test files as `*.spec.ts`
