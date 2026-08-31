from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from hashlib import sha256
from secrets import token_urlsafe
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.orm import Session, joinedload

from app.core.config import Settings, get_settings
from app.db.models import AuthSession


SESSION_TOKEN_BYTES = 32


@dataclass(frozen=True, slots=True)
class SessionPolicy:
    idle_timeout: timedelta
    absolute_timeout: timedelta

    def __post_init__(self) -> None:
        if self.idle_timeout <= timedelta(0):
            raise ValueError("Session idle timeout must be positive.")
        if self.absolute_timeout <= timedelta(0):
            raise ValueError("Session absolute timeout must be positive.")

    @classmethod
    def from_settings(cls, settings: Settings | None = None) -> SessionPolicy:
        resolved_settings = settings or get_settings()
        return cls(
            idle_timeout=timedelta(
                seconds=resolved_settings.auth_session_idle_ttl_seconds,
            ),
            absolute_timeout=timedelta(
                seconds=resolved_settings.auth_session_absolute_ttl_seconds,
            ),
        )


@dataclass(frozen=True, slots=True)
class IssuedSession:
    token: str = field(repr=False)
    record: AuthSession


def generate_session_token() -> str:
    return token_urlsafe(SESSION_TOKEN_BYTES)


def hash_session_token(token: str) -> str:
    if not isinstance(token, str) or not token:
        raise ValueError("Session token must be a non-empty string.")
    return sha256(token.encode("utf-8")).hexdigest()


class OpaqueSessionService:
    def __init__(self, policy: SessionPolicy | None = None) -> None:
        self.policy = policy or SessionPolicy.from_settings()

    def create(
        self,
        db: Session,
        user_id: UUID,
        *,
        now: datetime | None = None,
    ) -> IssuedSession:
        issued_at = _resolve_now(now)
        raw_token = generate_session_token()
        record = AuthSession(
            user_id=user_id,
            token_hash=hash_session_token(raw_token),
            created_at=issued_at,
            last_seen_at=issued_at,
            expires_at=issued_at + self.policy.absolute_timeout,
        )
        db.add(record)
        db.flush()
        return IssuedSession(token=raw_token, record=record)

    def lookup(self, db: Session, token: str) -> AuthSession | None:
        statement = (
            select(AuthSession)
            .options(joinedload(AuthSession.user))
            .where(AuthSession.token_hash == hash_session_token(token))
        )
        return db.scalar(statement)

    def validate(
        self,
        db: Session,
        token: str,
        *,
        now: datetime | None = None,
        touch: bool = True,
    ) -> AuthSession | None:
        checked_at = _resolve_now(now)
        record = self.lookup(db, token)
        if record is None or not self._is_valid(record, checked_at):
            return None

        last_seen_at = _stored_datetime_as_utc(record.last_seen_at)
        if touch and checked_at > last_seen_at:
            result = db.execute(
                update(AuthSession)
                .where(
                    AuthSession.id == record.id,
                    AuthSession.last_seen_at < checked_at,
                )
                .values(last_seen_at=checked_at)
                .execution_options(synchronize_session="fetch"),
            )
            if result.rowcount == 0:
                db.refresh(record, attribute_names=["last_seen_at"])

        return record

    def revoke(
        self,
        db: Session,
        token: str,
        *,
        now: datetime | None = None,
    ) -> bool:
        record = self.lookup(db, token)
        if record is None:
            return False

        if record.revoked_at is None:
            record.revoked_at = _resolve_now(now)
            db.flush()
        return True

    def _is_valid(self, record: AuthSession, checked_at: datetime) -> bool:
        if record.revoked_at is not None:
            return False
        if record.user.account_status != "active":
            return False
        if _stored_datetime_as_utc(record.expires_at) <= checked_at:
            return False

        idle_expires_at = (
            _stored_datetime_as_utc(record.last_seen_at) + self.policy.idle_timeout
        )
        return idle_expires_at > checked_at


def _resolve_now(value: datetime | None) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("Session time must be timezone-aware.")
    return value.astimezone(timezone.utc)


def _stored_datetime_as_utc(value: datetime) -> datetime:
    """Normalize persisted UTC values defensively at the security boundary."""

    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
