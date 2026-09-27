# interview-khichuri-api

Backend for **Interview Khichuri** — a self-hostable, privacy-first AI interview-preparation and
job-tracking platform.

NestJS 12 · TypeScript · Drizzle ORM · better-auth · Vercel AI SDK · Node >= 22

> Monorepo note: this is one of several sibling projects (not an npm workspace). The web client
> lives in `../interview-khichuri-web`. Shared domain vocabulary lives in the parent
> `CONTEXT.md`; architecture notes in `../docs/architecture.md`.

---

## Table of contents

- [What this service does](#what-this-service-does)
- [Stack](#stack)
- [Two run modes](#two-run-modes)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Database workflow](#database-workflow)
- [Scripts](#scripts)
- [Modules and routes](#modules-and-routes)
- [Auth](#auth)
- [AI features](#ai-features)
- [Storage and file uploads](#storage-and-file-uploads)
- [Email](#email)
- [Testing](#testing)
- [Linting and formatting](#linting-and-formatting)
- [Cross-cutting behaviour](#cross-cutting-behaviour)
- [Project layout](#project-layout)

---

## What this service does

Everything behind the Interview Khichuri UI:

- **Job tracking** — jobs, statuses, deadlines, topics, lookups, and an AI job-description
  extractor.
- **Resume tooling** — resume CRUD, public share slugs, PDF text extraction, per-job ATS scoring,
  and standalone resume review.
- **Prep sessions and mock interviews** — session/topic/question modelling, AI question generation,
  and a streaming live-interview follow-up endpoint.
- **Notes** — notes with a single optional PDF/image attachment, plus a streaming "learn more" AI
  endpoint.
- **Profile / job profile** — a large normalised profile graph (experience, education, projects,
  publications, references, skills, preferences).
- **Calendar** — job-derived deadlines and interviews merged with custom events.
- **Prompt library** — user-authored prompts with likes and per-user defaults, validated by an LLM
  pass before publish.
- **BYOK AI keys** — users supply their own provider keys; keys are encrypted at rest and only one
  key per provider can be active at a time.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | NestJS 12 (Express adapter) |
| Language | TypeScript, `module: nodenext` |
| ORM | Drizzle ORM + `drizzle-kit` |
| Database | PostgreSQL 16 (web mode) / SQLite via `better-sqlite3` (app mode) |
| Auth | `better-auth` via `@thallesp/nestjs-better-auth`, Drizzle adapter |
| Validation | Zod 4 via a global `StandardSchemaValidationPipe` |
| AI | Vercel AI SDK (`ai`), `@ai-sdk/google`, `@ai-sdk/openai`, `@google/genai` (TTS only) |
| Object storage | Cloudflare R2 through `@aws-sdk/client-s3` |
| Email | `resend` |
| Security | `helmet`, `@nestjs/throttler`, CORS allowlist |
| Tests | Vitest (unit + supertest e2e) |
| Lint / format | ESLint 10 flat config + Prettier |

There is **no Swagger/OpenAPI** setup — endpoints are typed with Zod DTOs instead
(`src/config/utils/zod-dto.ts`).

## Two run modes

The same codebase targets two deployments. `IS_APP_MODE` is the single switch that decides
everything downstream (read directly from `process.env` in `src/app.module.ts:25` and
`drizzle.config.ts:3`):

| | **web mode** (default) | **app mode** (desktop shell) |
| --- | --- | --- |
| Trigger | `IS_APP_MODE` unset/false | `IS_APP_MODE=true` |
| Database | PostgreSQL (`postgres` driver) | SQLite file (`better-sqlite3`) |
| Tables | 40, including the 6 auth tables | 34 — the auth tables are skipped entirely |
| Auth | `BetterAuthModule` loaded | **Not loaded** |
| Email | `EmailModule` loaded | **Not loaded** |
| Env validation | full `envSchema` | `basicSchema` only (`NODE_ENV`, `DATABASE_URL`, `FRONTEND_URL`) |
| Schema source | `src/database/postgres/schemas` | `src/database/sqlite/schemas` |
| Migrations | `src/database/postgres/migrations` | `src/database/sqlite/migrations` |

All feature modules are shared between the two modes; only the database and the auth/email wiring
diverge. The e2e suite runs the same specs against both.

## Getting started

```bash
# 1. dependencies
npm install

# 2. start Postgres
npm run db:dev:up        # podman-compose, postgres:16-alpine on :5432, volume postgres_dev_data

# 3. point .env at it, then create the schema
npm run db:push

# 4. seed lookup reference data (roles, categories, topics)
#    standalone script — not a wired-up npm script, and tsx is not a declared
#    dependency, so npx will fetch it on first run
npx tsx scripts/seed.ts

# 5. run
npm run start:dev
```

The API listens on `PORT` (default `3000`) and serves everything under **`/api/v1`**, plus
better-auth at **`/api/auth`**.

> `DATABASE_URL` in `.env` is a `file://` URL in app mode and a `postgresql://` URL in web mode.
> The `file://` prefix is stripped for `better-sqlite3` in `src/database/database.module.ts`.

## Environment variables

Config is validated at boot by `src/config/utils/env.schema.ts`, so a bad or missing value fails
fast rather than at first request. **All validated variables are required.**

### Required in both modes (`basicSchema`)

| Variable | Notes |
| --- | --- |
| `NODE_ENV` | `development` \| `production` \| `test` \| `local` |
| `DATABASE_URL` | Valid URL. `postgresql://…` or `file://…` |
| `FRONTEND_URL` | Valid URL. Used for CORS and as the passkey `rpID` host |

### Additionally required in web mode

| Variable | Constraint |
| --- | --- |
| `BETTER_AUTH_SECRET` | exactly 32 chars |
| `GITHUB_CLIENT_ID` | exactly 20 chars |
| `GITHUB_CLIENT_SECRET` | exactly 40 chars |
| `GOOGLE_CLIENT_ID` | exactly 72 chars, must end `.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | exactly 35 chars |
| `GITLAB_CLIENT_ID` | exactly 64 chars |
| `GITLAB_CLIENT_SECRET` | exactly 70 chars |
| `RESEND_API_KEY` | exactly 36 chars |
| `RESEND_FROM_EMAIL` | valid email |
| `R2_BUCKET_NAME` | any string |
| `R2_ENDPOINT` | valid URL, exactly 65 chars, must end `.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY` | exactly 32 chars |
| `R2_SECRET_KEY` | exactly 64 chars |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes, AES-256-GCM) |

The **exact-length** constraints are deliberate but strict — a longer real-world OAuth secret will
fail validation. If you swap providers, adjust the schema.

### Read at runtime but not validated

| Variable | Default | Used by |
| --- | --- | --- |
| `IS_APP_MODE` | — | mode switch (`app.module.ts`, `drizzle.config.ts`) |
| `PORT` | `3000` | `src/main.ts:25` |
| `R2_REGION` | `auto` | `file-upload.service.ts:34` |
| `MODE` | — | informational |

`.env.test.app` and `.env.test.web` are the e2e fixtures. The web one contains placeholder
credentials of exactly the right lengths so schema validation passes without real secrets.

## Database workflow

Schemas are **hand-written** Drizzle table definitions under
`src/database/{postgres,sqlite}/schemas/` (split by domain: `auth`, `calendar`, `company`,
`gen-ai`, `jobs`, `lookups`, `notes`, `prepSession`, `profile`, `prompts`). Only *migrations* are
generated by `drizzle-kit`.

```bash
npm run db:generate   # generate a migration from schema changes
npm run db:migrate    # apply pending migrations
npm run db:push       # push schema straight to the DB (no migration file)
npm run db:studio     # Drizzle Studio

npm run db:dev:up     # start dev Postgres (podman-compose)
npm run db:dev:rm     # stop it and delete the volume
npm run db:dev:reset  # rm + up + push
```

Container engine: the compose scripts call `podman-compose`. Swap to `docker compose` if that's
what you have.

`scripts/ci-build-check.sh` reproduces the production build inside a throwaway `node:<major>-bookworm`
container with `NODE_ENV=production` and a plain `npm install`, then asserts the build artifact —
use it to catch dev-dependency leaks before deploy. Override the engine with `CONTAINER_ENGINE`.

### The repository abstraction

`IDatabaseService` (`src/database/database.service.ts`) is an abstract class that both
`PostgresService` and `SqliteService` implement. Modules inject the abstraction, never a driver:

`database()` · `withTransaction()` · `dbPing()` · `dbClear()` · `create` · `createMany` · `count` ·
`findAllByColumn` · `search` · `findById` · `update` · `delete` · `syncJunctionTable` ·
`syncOneToMany`

`dbClear()` is hard-gated to `NODE_ENV` in `{development, test, local}` and refuses to touch
production data. `DatabaseLifecycleService` closes the client on shutdown.

## Scripts

| Script | What it does |
| --- | --- |
| `start` | Run once |
| `start:dev` | Watch mode |
| `start:debug` | Watch + inspector |
| `start:prod` | `node dist/src/main` (note the `src/` segment) |
| `build` | `nest build` → `dist/src/` |
| `db:*` | See [Database workflow](#database-workflow) |
| `lint` / `lint:fix` | ESLint over `{src,apps,libs,test}/**/*.ts` |
| `format` / `format:check` | Prettier over `src/**/*.ts` and `test/**/*.ts` |
| `test:unit` | Vitest watch mode |
| `test:cov` | Vitest with V8 coverage |
| `test:e2e` | Boot test DB, push both schemas, run both e2e projects |
| `test:e2e:web` | e2e against Postgres only |
| `test:e2e:app` | e2e against SQLite only |
| `test:e2e:watch` | Watch the e2e suite |
| `test` | `test:e2e` then a single unit run |
| `test:debug` | Vitest under `node --inspect-brk` |

## Modules and routes

All feature routes are versioned under `/api/v1`.

| Module | Prefix | What it owns |
| --- | --- | --- |
| `health` | `health` | Liveness/DB ping. `health/public` is `@AllowAnonymous()` |
| `jobs` | `jobs` | Job CRUD, filters, AI job-description extraction, job-detail lookups |
| `resume` | `resume` | Resume CRUD, PDF upload, text extraction, ATS scoring, standalone review, public `slug` view (`@AllowAnonymous()`) |
| `profile` | `profile` | The full job-profile graph, normalised into ~15 tables |
| `notes` | `notes` | Notes + single attachment; `notes/learn-more/stream` streams an AI explanation (SSE) |
| `prep-session` | `prep-session` | Sessions, topics, questions |
| `interviews` | `interviews` | Interview records and `follow-ups/stream` (SSE) |
| `calendar` | `calendar/events` | Custom events; job deadlines are derived |
| `company` | `company` | Company records attached to jobs |
| `lookups` | `lookups/:schema` | Reference data (roles, categories, topics, industries) |
| `gen-ai` | `ai/tts` | Speech synthesis |
| `api-key` | `ai/api-keys` | BYOK key CRUD, activation, verification |
| `prompts` | `prompts` | Prompt library, likes, per-user defaults |
| `utilities` | `upload` | Multipart upload to object storage |
| `better-auth` | `api/auth` | Mounted by `@thallesp/nestjs-better-auth`, **not** versioned |

Two endpoints are **SSE** and bypass the response envelope via `@SkipEnvelope()`:
`POST interviews/:id/follow-ups/stream` and `POST notes/learn-more/stream`. Both are built on
`src/common/create-stream.ts` and emit a terminal `{type: "finish"}` or `{type: "error"}` event.

## Auth

`better-auth` is mounted at `/api/auth` by the library, which also registers a **global
`AuthGuard`**. That is why `AppModule`'s own `APP_GUARD` list only shows `ThrottlerGuard` — the auth
guard is implicit. Opt a route out with `@AllowAnonymous()`.

Plugins and configuration live in `src/better-auth/better-auth.module.ts`:

- **`admin()`** — user management and impersonation.
- **`passkey()`** — WebAuthn. `rpID` is derived from **`FRONTEND_URL`'s hostname**, not the API
  host, because the credential is created on the frontend origin. `rpName: "Interview Khichuri"`.
- **`twoFactor()`** — TOTP plus backup codes.
- **`lastLoginMethod()`** — remembers the last-used sign-in method for the login screen.
- **`haveIBeenPwned()`** — range queries on `/sign-up/email`, `/change-password`,
  `/admin/create-user`, `/admin/set-user-password`.

Other behaviour worth knowing:

- Email + password **with** verification; `autoSignInAfterVerification`; social providers
  `google`, `github`, `gitlab`.
- Account linking allows different emails.
- Sessions: 30-day expiry, 5-minute cookie cache.
- Production cookies are `SameSite=None; Secure` (the frontend and API are on different sites).
- IP resolution trusts `x-forwarded-for` and `cf-connecting-ip`.
- better-auth's **own** rate limits are separate from the global throttler: 10 requests per 10
  minutes by default, tightened to 5 for `/sign-in/email` and 3 for `/sign-up/email` and
  `/two-factor/*`.

### Account-creation guards (`src/better-auth/better-auth.helper.ts`)

- `databaseHooks.user.create.before` lowercases the email, rejects disposable addresses via
  `mailchecker`, and does a `dns.resolveMx` lookup to reject domains with no mail server.
- `hooks.before` runs a breach check on `/reset-password` **before** the token is consumed, using
  the k-anonymity range API at `api.pwnedpasswords.com` (throws `PASSWORD_COMPROMISED`).

## AI features

`GenAiService` (`src/gen-ai/gen-ai.service.ts`) is the only place that talks to a model. It resolves
the user's own key per request through `ApiKeyService.useApiKey(provider, fn, userId)` — there is no
shared or platform-funded key.

### Providers

Seven providers are configured in `src/gen-ai/gen-ai.constants.ts`; all but Google use the
OpenAI-compatible SDK with a per-provider `baseURL`.

| Key | SDK | Base URL | Default model |
| --- | --- | --- | --- |
| `google` | google | — | `gemini-3.5-flash-lite` |
| `openai` | openai | `https://api.openai.com/v1` | `gpt-4o-mini` |
| `groq` | openai | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| `openrouter` | openai | `https://openrouter.ai/api/v1` | `meta-llama/llama-3.3-70b-instruct:free` |
| `mistral` | openai | `https://api.mistral.ai/v1` | `mistral-small-latest` |
| `github` | openai | `https://models.github.ai/inference` | `openai/gpt-4o-mini` |
| `cerebras` | openai | `https://api.cerebras.ai/v1` | `llama3.1-8b` |

### Operations

| Method | Used for |
| --- | --- |
| `generateStructured<T>` | The core: `generateText` + `Output.object` against a Zod schema |
| `streamMarkdown` | Notes "learn more" SSE |
| `streamQuestions` | Live-interview follow-up SSE |
| `extractJob` | Job description → structured job |
| `extractResume` | Resume text → structured profile (truncated to 15 000 chars, prompt-injection guarded) |
| `scoreResumeForJob` | ATS score for a job + resume pair |
| `reviewResumeStandalone` | Resume review with no job context |
| `generateInterviewQuestions` | Questions for a session |
| `generateInterviewFollowUps` | Follow-ups during a live interview |
| `generateQuestions` | Fallback question generation, with an `avoidRepeat` list |
| `synthesizeSpeech` | Google TTS (via `@google/genai`), PCM16 → WAV, process-wide LRU cache (50 entries) |

Two details are easy to get wrong:

- **Gemini rejects several JSON-Schema keywords** (`minLength`, `maxLength`, `pattern`, `format`,
  `default`, `minimum`, `maxItems`, `additionalProperties: false`).
  `src/gen-ai/gemini-schema.ts` strips them and records the schema as "rejected"; the next call
  retries once *without* the schema, prompting for a JSON skeleton instead. If you add a new Zod
  schema, add its keywords to that list.
- **The TTS cache is not keyed by user.** `synthesizeSpeech` calls `assertActiveKey` *before*
  serving a cache hit, so an inactive key still errors. Keep it that way.

System prompts are constants in `gen-ai.constants.ts`, owned by the app and never mixed with user
content. User-authored prompts (the prompt library) are a separate concern entirely — see
`CONTEXT.md`.

### API keys

Stored encrypted with AES-256-GCM (`EncryptionService`, `iv:authTag:ciphertext` hex, keyed by
`ENCRYPTION_KEY`). `activateApiKey` runs in a transaction and a partial unique index
(`idx_active_api_key`) enforces one active key per provider+user at the database level. `verify`
really calls the provider with `"Reply with just the word: ok"` — skipped when `NODE_ENV === "test"`.

## Storage and file uploads

`FileUploadService` (`src/utilities/upload/file-upload.service.ts`) uses `@aws-sdk/client-s3`
against Cloudflare R2 (region defaults to `auto`).

- Accepted extensions: `.pdf .jpg .jpeg .png`.
- Key layout: `{filePrefix ?? "files"}/{profileId}/{uuid}{ext}`.
- Multipart limit: 5 MB, memory storage (no temp files).
- `getSignedUrl(key, expiresIn = 7d)` forces `Content-Disposition: inline` and
  `Content-Type: application/pdf`.
- Resume PDFs are pulled back out of R2 and parsed with **`unpdf`** (`extractText(..., { mergePages: true })`);
  a failure or an empty result is a `400`.

## Email

`resend`, three templates in `src/email/email.templates.ts`: **verification**, **password reset**,
and **delete-account**. `EmailService` logs and throws a generic `InternalServerErrorException` on
failure so provider errors never leak. Only better-auth calls it, and e2e tests mock it out
entirely.

## Testing

Two Vitest projects, split by database backend.

| Project | Config | Setup file | Database | Auth | Isolation |
| --- | --- | --- | --- | --- | --- |
| `unit` | `vitest.config.mts` | — | none (`src/**/*.spec.ts`) | — | `isolate: false`, 1 worker |
| `e2e:web` | `vitest.e2e.config.mts` → project `web` | `test/setup.web.ts` | Postgres on `:5433` | loaded | `isolate: true` |
| `e2e:app` | `vitest.e2e.config.mts` → project `app` | `test/setup.app.ts` | SQLite `file://` | **skipped** | `isolate: true` |

Both e2e projects match `test/**/*.e2e-spec.ts` and differ **only** in the setup file that loads
`.env.test.web` or `.env.test.app`. The same specs run in both modes; `test/utils/auth-helpers.ts`
returns an empty cookie and `userId` when the connection is not a `PgDatabase`, and individual
specs branch on app mode. Sessions are faked by seeding `user`/`account`/`session` rows and
minting an HMAC-SHA256-signed `better-auth.session_token` cookie.

`test/utils/bootstrap.ts` builds the real `AppModule` through `@nestjs/testing`, overriding
`EmailService`, the throttler (raised to 9 999 so rate limiting never fails a test), and
`FileUploadService`.

```
test/
  calendar/  company/  gen-ai/  interview/  jobs/  lookups/
  notes/     prep-session/  profile/  resume/
  health.e2e-spec.ts  setup.app.ts  setup.web.ts
  utils/     auth-helpers.ts  bootstrap.ts  data-helpers.ts  test-data.ts
```

Each domain folder pairs its spec with a `*.test-data.ts` fixture file. Unit specs (11) sit
beside the code as `*.spec.ts` and cover `gen-ai`, `jobs`, `profile`, `resume`, `health`, and the
SSE stream helper.

## Linting and formatting

- **ESLint 10** flat config (`eslint.config.mjs`): `strictTypeChecked` + `stylisticTypeChecked`,
  plus `@darraghor/eslint-plugin-nestjs-typed` and the Prettier plugin (registered last so it
  wins). Notable: `no-explicit-any`, `no-floating-promises`, `no-misused-promises`,
  `explicit-module-boundary-types`, and `consistent-type-imports` are all errors;
  `no-unnecessary-condition` is a warning. `import-x/order` enforces import grouping, `no-cycle` is
  a warning, and `sonarjs/cognitive-complexity` warns at 15.
- **Prettier** (`prettier.config.mjs`): double quotes, 2 spaces, 80 columns, trailing commas
  everywhere.

## Cross-cutting behaviour

- **URI versioning** (`src/main.ts:12-16`) gives a base path of `/api/v1`. There is no
  `setGlobalPrefix`.
- **`bodyParser: false`** in `NestFactory.create` — better-auth installs its own parser with a 2 MB
  limit, so it is not registered globally.
- **`ResponseTransformInterceptor`** wraps every JSON response as `{ statusCode, message, data }`.
  Opt out per handler with `@SkipEnvelope()` (the two SSE endpoints do).
- **`CustomZodValidationPipe`** is the global `APP_PIPE`. It flattens Zod issues to
  `"path: message"` for a 400 and strips prototype-pollution keys.
- **CORS** (`src/config/utils/cors.config.ts`) allows an explicit header list, sends credentials,
  and in `local`/`development` also permits `localhost`/`127.0.0.1` on any port. Blocked origins are
  logged. In other environments only `FRONTEND_URL` is allowed.
- **Global throttling** is 60 requests per 60 seconds (`app.module.ts:35-42`). There are no
  per-route overrides.
- `helmet()` is applied with default options.

## Project layout

```
src/
  app.module.ts          Mode switch, global pipe/guard/interceptor
  main.ts                Bootstrap: versioning, CORS, helmet
  better-auth/           Auth module + account-creation guards
  calendar/  company/  jobs/  lookups/  notes/
  prep-session/          Sessions, topics, questions
    interview/           Interview records + follow-up SSE
  profile/  resume/  utilities/upload/
  gen-ai/                Service, prompts, providers, TTS
    api-key/             BYOK key CRUD + AES-256-GCM encryption
    prompts/             Prompt library + LLM validator
  database/              Abstract repository + per-driver services
    postgres/{schemas,migrations}/
    sqlite/{schemas,migrations}/
  config/                env schema, CORS config, guards, pipes, interceptors
  common/                create-stream, validation helpers
  email/  health/
  types/                 ambient declarations
scripts/
  seed.ts                Lookup reference data
  ci-build-check.sh      Production build smoke test in a container
  probe-gemini-structured.ts
test/                    e2e specs, fixtures, and helpers
```

Import aliases: `@/*` → repo root, `@/src/*` → `src/*`, `@/test/*` → `test/*`.

## License

Private / unlicensed. All rights reserved.
