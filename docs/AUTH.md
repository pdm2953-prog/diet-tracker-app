# Authentication Foundation

Chapter 6-A establishes backend persistence and security primitives only. It does not expose authentication HTTP endpoints or connect an account to nutrition data.

## Email identity

- A user's login identity is an email address. `display_name` is a separate field.
- Input is trimmed and passed through `email-validator` with deliverability checks disabled. The normalized address is stored in `users.email`.
- Login comparison uses the deterministic `casefold()` value stored in `users.email_identity_key`. A database unique constraint is the final uniqueness authority.
- Provider-specific rewriting is forbidden. In particular, Gmail dots and `+tag` portions are never removed.

## Password hashing

- Plaintext passwords must never be persisted or logged.
- Passwords are hashed with Argon2id through `pwdlib`/`argon2-cffi`, using library-generated salts and standard PHC strings. No custom hash format is used.
- The ORM rejects non-Argon2id `password_hash` assignments before SQL execution, and its error does not include the rejected value.
- The foundation service accepts non-empty strings and deliberately does not define the complete product password policy. Endpoint-level input limits and UX policy belong to the registration/login chapter.
- Hash verification fails closed for unknown formats, and `needs_rehash` is exposed so parameters can evolve.

## Opaque sessions

- A session credential is a cryptographically random 256-bit opaque token.
- The raw token is returned only when a session is created. Only its SHA-256 hash is persisted in `auth_sessions.token_hash`.
- Validation rejects missing, revoked, absolute-expired, idle-expired, and disabled-user sessions.
- Successful validation updates `last_seen_at` by default, so the idle window rolls forward. `lookup` never touches it, callers can request `touch=False`, and a session is invalid exactly at either expiry boundary. The absolute expiry never moves.
- Idle and absolute expiration durations are configuration values. Callers may inject a timezone-aware current time and policy for deterministic tests.
- All account and session timestamps represent UTC. PostgreSQL stores timezone-aware timestamps; SQLite drops the timezone marker, so the ORM type adapter restores UTC on load before values reach services or DTOs.
- Session service methods flush changes but do not own the surrounding transaction. HTTP transport, cookies, bearer headers, CSRF, and CORS changes are intentionally deferred.

## Data ownership boundary

Account authentication and nutrition dataset ownership/claim are separate concerns. Creating or authenticating an account must not automatically claim, merge, upload, or expose the existing local meal and goal dataset. That ownership flow remains out of scope for Chapter 6-A.

## Infrastructure boundary

Local development and tests use SQLite. SQLAlchemy 2 models and Alembic migrations are structured for a later PostgreSQL deployment, but AWS, production databases, cloud sync, and production operations are not part of this chapter. Application startup never calls `create_all()`; schema changes are applied through Alembic migrations.
