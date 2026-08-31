from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import User
from app.security.email_identity import EmailIdentityError, normalize_email_identity
from app.security.passwords import PasswordService, password_service
from app.security.sessions import IssuedSession, OpaqueSessionService


_DUMMY_PASSWORD = "diet-tracker-auth-dummy-verification-value"
_DUMMY_PASSWORD_HASH = password_service.hash(_DUMMY_PASSWORD)
EMAIL_IDENTITY_UNIQUE_CONSTRAINT = "uq_users_email_identity_key"


class InvalidCredentialsError(ValueError):
    """Authentication failed without identifying which credential was wrong."""


class InvalidRegistrationError(ValueError):
    """Registration input could not be normalized for persistence."""


@dataclass(frozen=True, slots=True)
class IssuedAccountSession:
    user: User
    session: IssuedSession


class AuthService:
    def __init__(
        self,
        *,
        passwords: PasswordService | None = None,
        sessions: OpaqueSessionService | None = None,
        dummy_password_hash: str = _DUMMY_PASSWORD_HASH,
    ) -> None:
        self.passwords = passwords or password_service
        self.sessions = sessions or OpaqueSessionService()
        self._dummy_password_hash = dummy_password_hash

    def register(
        self,
        db: Session,
        *,
        email: str,
        display_name: str,
        password: str,
    ) -> IssuedAccountSession:
        try:
            identity = normalize_email_identity(email)
        except EmailIdentityError:
            raise InvalidRegistrationError("Registration input is invalid.") from None

        normalized_display_name = display_name.strip()
        if not normalized_display_name or len(normalized_display_name) > 100:
            raise InvalidRegistrationError("Registration input is invalid.")

        user = User(
            email=identity.normalized_email,
            email_identity_key=identity.identity_key,
            display_name=normalized_display_name,
            password_hash=self.passwords.hash(password),
        )
        db.add(user)
        db.flush()
        issued_session = self.sessions.create(db, user.id)
        return IssuedAccountSession(user=user, session=issued_session)

    def login(
        self,
        db: Session,
        *,
        email: str,
        password: str,
    ) -> IssuedAccountSession:
        try:
            identity = normalize_email_identity(email)
        except EmailIdentityError:
            self.passwords.verify(password, self._dummy_password_hash)
            raise InvalidCredentialsError("Invalid credentials.") from None

        user = db.scalar(
            select(User).where(User.email_identity_key == identity.identity_key),
        )
        if user is None:
            self.passwords.verify(password, self._dummy_password_hash)
            raise InvalidCredentialsError("Invalid credentials.")

        password_matches = self.passwords.verify(password, user.password_hash)
        if not password_matches or user.account_status != "active":
            raise InvalidCredentialsError("Invalid credentials.")

        if self.passwords.needs_rehash(user.password_hash):
            user.password_hash = self.passwords.hash(password)

        issued_session = self.sessions.create(db, user.id)
        return IssuedAccountSession(user=user, session=issued_session)


def get_auth_service() -> AuthService:
    return AuthService()


def is_email_identity_unique_violation(exc: IntegrityError) -> bool:
    """Recognize only the users.email_identity_key uniqueness constraint."""

    original = exc.orig
    diagnostic = getattr(original, "diag", None)
    if getattr(diagnostic, "constraint_name", None) == EMAIL_IDENTITY_UNIQUE_CONSTRAINT:
        return True

    message = str(original).casefold()
    return "unique constraint failed: users.email_identity_key" in message
