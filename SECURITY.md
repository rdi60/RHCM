# Security

This document records the Stage 7 security hardening pass: what changed,
why, and what was reviewed and deliberately left as-is (with the reasoning
for each). It's a snapshot from that pass, not a standing policy document —
update it when the relevant code changes.

## Authentication & session handling

### Session fixation protection

`AuthService` regenerates the session ID (`req.session.regenerate(...)`,
via the `regenerateSession()` helper in `auth.service.ts`) immediately
before writing any new privilege onto the session — both on the
password-verified login path (before setting `pendingMfaUserId`) and the
MFA-verified path (before setting `userId`). A session ID that existed
before authentication — for example one an attacker planted in a victim's
browser — can never become a logged-in session.

### TOTP replay protection

A previous version of this API accepted the same valid TOTP code more than
once within its 30-second validity window. `AuthService.verifyMfa` now uses
`otplib`'s `authenticator.checkDelta()` (not `check()`) to learn the exact
time-step a submitted code corresponds to, and rejects it if that step is
`<=` the user's `lastMfaStep` (a new `User.lastMfaStep` column, migration
`20261123010000_stage7_mfa_replay_protection`) — i.e. a code for this step
or any earlier one was already used. A code that's valid but was already
accepted is now treated the same as an invalid one (`401 Invalid
authentication code`), so a captured code can't be replayed even within its
own validity window. Covered by `apps/api/test/auth-rbac.e2e-spec.ts`'s
"rejects a second use of the same TOTP code (replay protection)" test.

This project's otplib configuration has `window: 0` (no tolerance for
adjacent time-steps) — the e2e suite's shared dev MFA secret is reused
across many logins of the same seeded accounts, so the test helper
(`loginWithMfa` in `apps/api/test/test-app.ts`) resets `lastMfaStep` to
`null` for the target user before generating and submitting a code. That's
a test-fixture reset only; it has no production code path.

### Body parsing

`main.ts` creates the Nest app with `bodyParser: false` and wires up only
`express.json({ limit: "1mb" })` — this API never accepts url-encoded or
multipart request bodies (file uploads go straight to object storage via a
presigned URL; see the Documents module). Besides removing dead attack
surface, this means a cross-site `<form>` POST — a browser "simple
request" that's never preflighted — can't carry a body this server will
parse at all, which is one more layer under the CORS/cookie posture below.

### CORS / CSRF posture

`app.enableCors({ origin: config.get("WEB_BASE_URL"), credentials: true })`
is a single fixed origin — it never reflects an arbitrary `Origin` header
back — combined with `sameSite: "lax"` session cookies, which the browser
never attaches to a cross-site POST at all (only to top-level, safe/GET
navigations). Together, for a JSON-only API with the body-parsing
restriction above, this is enough to stop a script on another origin from
completing a credentialed state-changing request here, without a separate
anti-CSRF token scheme.

### `trust proxy`

The Express app now sets `app.set("trust proxy", 1)`. This API is always
meant to run behind a reverse proxy/load balancer in production (see
`docker-compose.prod.yml`); without this, `req.ip` (used for IP-based
throttling) and `req.secure` (which the session cookie's `secure` flag
depends on via `X-Forwarded-Proto`) would reflect the proxy, not the real
client.

### Rate limiting

`POST /auth/login` and `POST /auth/mfa/verify` were already throttled.
`POST /auth/password/reset` was not — it now shares the same
`AUTH_PASSWORD_THROTTLE_LIMIT` as `password/forgot`, so the reset-token
guess space can't be brute-forced at an unbounded rate.

## API documentation exposure

The Swagger UI (`/api/docs`) is on by default outside production and off
in production unless `ENABLE_API_DOCS=true` is explicitly set — this is a
multi-tenant clinic system, so the full route/schema map isn't published
by default. Even when it's on, every route still enforces its own
`@RequirePermissions`/`@Public`/`@SelfService` guard as normal; "Try it
out" still needs a real, permitted session, so enabling the docs UI never
bypasses authorization.

## Dependency vulnerability sweep

`pnpm audit` found 84 advisories before this pass (5 critical, 32 high, 37
moderate, 10 low). After:

- **`apps/web`'s `next` upgraded 15.1.3 → 15.5.29** — fixes all 5
  critical findings (RCE in the React Flight protocol, an authorization
  bypass in Next.js Middleware, two Image-Optimization-API RCEs, and a
  Server Actions DoS) plus the `sharp` (bundled image library) and `next`
  DoS findings. Verified with a full `pnpm build` of the web app (21
  routes, zero errors).
- **`@nestjs/common`/`@nestjs/core`/`@nestjs/platform-express`/
  `@nestjs/testing` upgraded 10.4.15 → 10.4.22** — latest patch on the
  pinned major (no breaking changes expected or observed; full unit + e2e
  suite still green).
- **`packages/shared`'s `zod` dependency removed** — it was never
  imported anywhere in the codebase (DTO validation uses
  `class-validator` throughout) and carried a memory-exhaustion advisory;
  removing an unused vulnerable dependency is strictly safer than pinning
  it to a newer major it will still never exercise.
- **pnpm `overrides` added** (root `package.json`) to force patched
  versions of transitive dependencies that *are* on a request's code
  path: `body-parser` → `1.20.9` (DoS via trailing bytes after a
  compressed body), `qs` → `6.17.1` (several DoS findings — `qs` parses
  every request's query string, via Express's router, regardless of the
  body-parser restriction above), `js-yaml@4.1.0` → `4.3.2` (quadratic-CPU
  DoS, pulled in by `@nestjs/swagger`), and `multer` → `2.5.0` (several
  DoS findings; multer itself is never wired up by any controller in this
  codebase — no `@UploadedFile`/`FileInterceptor` usage — but the override
  costs nothing since nothing exercises it).

Verified after each change: `pnpm build` (both apps) and the full test
suite (`pnpm --filter @rhcm/api test` + `pnpm --filter @rhcm/api
test:e2e`, 87/87 passing) still green.

**Remaining findings (25, 0 critical, 9 high, 12 moderate, 4 low) — reviewed
and accepted, with reasoning:**

- **`@nestjs/cli`'s own toolchain** (`ajv`, `glob`, `minimatch`,
  `picomatch`, `tmp`, `webpack`) — all `devDependencies` of the Nest CLI
  used only to run `nest build`/`nest start --watch` on a developer's or
  CI's own machine. None of these ship in the production image (the
  Dockerfiles install only production dependencies) or process any
  attacker-controlled input.
- **`@nestjs/config`'s `lodash`** (code injection via `_.template`,
  prototype pollution) — used internally by `ConfigModule` for merging
  configuration objects sourced from this app's own `.env` files, never
  from request input.
- **`@nestjs/common`'s `file-type`** — a transitive dependency of Nest's
  own (unused-here) file-upload utilities; no controller uses
  `FileInterceptor`/`@UploadedFile` in this codebase (uploads go through a
  presigned S3 URL, confirmed by `grep`), so this code path never runs.
- **`express`'s `path-to-regexp`** (ReDoS via multiple route parameters)
  — this is only exploitable when an application builds route patterns
  from untrusted input; every route in this API is a static string
  literal in a controller decorator, never user-supplied.
- **`express-session`'s `on-headers`** (low severity — response-header
  manipulation) — internal to how `express-session` writes the
  `Set-Cookie` header; low impact, and fixing it means waiting on
  `express-session` to bump its own pin rather than overriding a header-
  writing library out from under session handling.
- **`@nestjs/core`'s SSE injection finding** (`GHSA-36xv-jgw5-4q75`) — only
  patched in NestJS 11.x; this app is pinned to NestJS 10.x and the
  affected code (`SseStream._transform()`) is never reached, since no
  controller in this codebase uses `@Sse()`. A NestJS 11 upgrade is a
  major-version migration in its own right (new middleware/guard typings,
  breaking changes across all 23 controllers) and is out of scope for a
  hardening pass — tracked here as a known follow-up rather than
  attempted blind.
- **`apps/web`'s `postcss`** (XSS in CSS stringify output, source-map path
  traversal) — `postcss` only runs at `next build`/`next dev` time to
  process Tailwind's CSS; it never runs against request input in the
  deployed app.

## Not yet addressed (tracked, not fixed in this pass)

- **Outbound email is not implemented.** `requestPasswordReset` returns
  the reset token directly in the API response outside production
  (`devResetToken`) for local/e2e convenience, and in production returns
  only the generic "if that email exists" message with no way to actually
  deliver the token to the user. A production deployment needs a mailer
  (a pluggable service — e.g. nodemailer against SMTP/SES/SendGrid, with a
  console-log fallback for environments with no mail provider configured)
  wired into `requestPasswordReset` and the user-invite flow before
  password reset or new-user onboarding is usable end-to-end in
  production. This is a legitimate gap found during this pass, but
  building a mailer abstraction is feature work beyond a hardening pass's
  scope — tracked here rather than attempted partially.
