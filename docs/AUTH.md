# Authentication

Chapter 6-A establishes the persistence and security primitives. Chapter 6-B adds the HTTP authentication contract. Chapter 6-C connects that contract to the frontend. Authentication still does not connect an account to nutrition data.

## Email identity

- A user's login identity is an email address. `display_name` is a separate field.
- Input is trimmed and passed through `email-validator` with deliverability checks disabled. The normalized address is stored in `users.email`.
- Login comparison uses the deterministic `casefold()` value stored in `users.email_identity_key`. A database unique constraint is the final uniqueness authority.
- Provider-specific rewriting is forbidden. In particular, Gmail dots and `+tag` portions are never removed.

## Password hashing

- Plaintext passwords must never be persisted or logged.
- Passwords are hashed with Argon2id through `pwdlib`/`argon2-cffi`, using library-generated salts and standard PHC strings. No custom hash format is used.
- The ORM rejects non-Argon2id `password_hash` assignments before SQL execution, and its error does not include the rejected value.
- The foundation service accepts non-empty strings and deliberately does not define the complete product password policy. HTTP request DTOs apply a bounded input length to protect the hashing boundary without presenting it as the final product password policy.
- Hash verification fails closed for unknown formats, and `needs_rehash` is exposed so parameters can evolve.

## Opaque sessions

- A session credential is a cryptographically random 256-bit opaque token.
- The raw token is returned only when a session is created. Only its SHA-256 hash is persisted in `auth_sessions.token_hash`.
- Validation rejects missing, revoked, absolute-expired, idle-expired, and disabled-user sessions.
- Successful validation updates `last_seen_at` by default, so the idle window rolls forward. `lookup` never touches it, callers can request `touch=False`, and a session is invalid exactly at either expiry boundary. The absolute expiry never moves.
- Idle and absolute expiration durations are configuration values. Callers may inject a timezone-aware current time and policy for deterministic tests.
- All account and session timestamps represent UTC. PostgreSQL stores timezone-aware timestamps; SQLite drops the timezone marker, so the ORM type adapter restores UTC on load before values reach services or DTOs.
- Session service methods flush changes but do not own the surrounding transaction. The HTTP service commits a successful issuance, touch, or revocation and rolls back handled failures.

## HTTP API

All endpoints are under `/api/v1/auth`:

- `POST /register` accepts `email`, `displayName`, and `password`, creates the user and first session in one transaction, and returns `201`.
- `POST /login` accepts `email` and `password`, creates a session, and returns `200`.
- `GET /session` validates the supplied credential, touches `last_seen_at`, commits the touch, and returns `200`.
- `DELETE /session` is idempotent, revokes a matching record when possible, and always returns `204` for missing, unknown, expired, revoked, or disabled-session credentials.

Successful JSON contains public user fields, `session.expiresAt`, and the selected transport. ORM identity keys, password hashes, and session token hashes are never public DTO fields. Every auth response has `Cache-Control: no-store`.

Login failures for an unknown email, malformed email, incorrect password, and disabled account all return the same `401 invalid_credentials`. Unknown and malformed identities run a verification against a process-local dummy Argon2id hash. Current-session failures for unknown, expired, revoked, or disabled sessions all return `401 unauthenticated` and do not touch `last_seen_at`.

Registration relies on `uq_users_email_identity_key` as the final concurrency-safe uniqueness authority. Only that constraint violation becomes the generic `409 registration_unavailable`; unrelated integrity errors remain internal failures. The generic duplicate response reduces detail disclosure but does not constitute complete account-enumeration prevention by itself.

Auth request validation returns only `422 invalid_request` and does not serialize Pydantic `input`, `ctx`, or request body data. This sanitizer is path-scoped to auth and does not alter the food API validation contract. Passwords, raw session tokens, Cookie/Set-Cookie values, and Authorization values must not be logged or included in errors.

Unhandled auth failures return only a fixed `500 internal_error` payload with `Cache-Control: no-store`; internal exception text is never copied into the client response. Credential cookies and bearer response DTOs are populated only after the surrounding database commit succeeds.

## HTTP transport

Web issuance defaults to an HttpOnly cookie. Native issuance must explicitly send `X-Auth-Transport: bearer`; only those successful register/login responses contain `credential: { scheme: "Bearer", sessionToken: ... }`. Cookie responses omit the `credential` field entirely. `X-Auth-Transport` selects a response transport and is not native identity or attestation. A bearer issuance request containing `Origin` is rejected, while `Sec-Fetch-*` may only be used as defense-in-depth and is not a trust signal.

Subsequent requests accept either the session cookie or `Authorization: Bearer <opaque-token>`. Tokens are not accepted from URLs, query parameters, or form data. Supplying cookie and Authorization credentials together to `GET /session` or `DELETE /session` returns `400 ambiguous_credentials`. Existing session cookies on register/login do not create transport ambiguity.

The production cookie is named `__Host-diet_tracker_session` and is `Secure`, `HttpOnly`, `SameSite=Strict`, `Path=/`, with no `Domain`. The default remains production-safe. Explicit local HTTP development may set `AUTH_ALLOW_INSECURE_DEV_COOKIE=true`, which selects a distinct `diet_tracker_session_dev` non-Secure cookie so the `__Host-` contract is never weakened silently. An invalid session cookie presented to `GET /session` is deleted, and cookie logout always emits deletion.

Cookie-based `POST /register` and `POST /login` require `application/json`, `X-CSRF-Protection: 1`, and an exact allowed `Origin`. Cookie-based `DELETE /session` requires the same CSRF header and Origin but no JSON body or Content-Type. Bearer requests do not use the cookie CSRF guard.

CORS enables credentials only for the explicit `BACKEND_CORS_ORIGINS` allowlist, never `*`. Browser methods are `GET`, `POST`, `DELETE`, and `OPTIONS`; allowed request headers are `Accept`, `Content-Type`, and `X-CSRF-Protection`. `Authorization` and `X-Auth-Transport` are deliberately excluded from the browser CORS allowlist.

## Frontend session lifecycle

- Native register/login explicitly requests bearer transport and persists the raw session token only through `expo-secure-store`. The token is never placed in AsyncStorage, localStorage, or React auth state.
- Web register/login uses `credentials: include`, the cookie CSRF header, and the server-issued HttpOnly cookie. Browser JavaScript does not persist or read a raw session token.
- Startup restores authentication and local nutrition data independently. Authentication gates first; an authenticated user then waits for nutrition hydration and sees first-run goal setup when required.
- A restore `401` clears the native credential before returning to the anonymous gate. For web, the 6-B invalid-cookie response expires the HttpOnly cookie and the frontend returns to the anonymous gate. Network, timeout, and `5xx` failures preserve the credential and expose a retryable unavailable gate.
- Native logout attempts server revocation, then clears SecureStore regardless of the server result; after local deletion succeeds it clears in-memory auth state. A SecureStore deletion failure stays unavailable so cleanup can be retried. Web logout returns to the anonymous gate only after the server's `204` response; network and `5xx` failures remain unavailable with retry and logout actions because JavaScript cannot delete the HttpOnly cookie.
- Logout does not delete, claim, merge, or namespace the local nutrition snapshot.

The frontend and food search share `EXPO_PUBLIC_BACKEND_URL`. Default web development uses `http://localhost:8000` so the strict cookie has the same site label as the default Expo web URL. Android emulators must use `http://10.0.2.2:8000`, and physical devices must use the development computer's reachable LAN address in `.env.local`. For device testing, run Uvicorn on `0.0.0.0`, allow the port through the local firewall, and keep the device and computer on the same network. Local HTTP browser auth also requires the explicit backend-only development setting `AUTH_ALLOW_INSECURE_DEV_COOKIE=true`.

## Data ownership boundary

Account authentication and nutrition dataset ownership/claim are separate concerns. Creating or authenticating an account must not automatically claim, merge, upload, or expose the existing local meal and goal dataset. That ownership flow remains out of scope through Chapter 6-C.

## Infrastructure boundary

Local development and tests use SQLite. SQLAlchemy 2 models and Alembic migrations are structured for a later PostgreSQL deployment, but AWS, production databases, cloud sync, and production operations are not part of this chapter. Application startup never calls `create_all()`; schema changes are applied through Alembic migrations. Chapter 6-B adds no schema migration.

Distributed rate limiting is intentionally not implemented against the local-only stack. Independent source and normalized-identity limits backed by production-capable shared state are required security work before Chapter 7 production exposure.
