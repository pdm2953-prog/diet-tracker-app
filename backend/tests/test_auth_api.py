from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import AuthSession, User
from app.db.session import (
    SessionFactory,
    create_database_engine,
    create_session_factory,
    get_db_session,
)
from app.main import create_app
from app.models.auth import BearerAuthResponseDto, BearerCredentialDto, LoginRequestDto
from app.security.auth_http import set_session_cookie
from app.security.email_identity import normalize_email_identity
from app.security.passwords import PasswordService, password_service
from app.security.sessions import OpaqueSessionService, hash_session_token
from app.services.auth import AuthService, get_auth_service, is_email_identity_unique_violation


BACKEND_ROOT = Path(__file__).resolve().parents[1]
WEB_ORIGIN = "http://localhost:8081"
COOKIE_HEADERS = {
    "Origin": WEB_ORIGIN,
    "X-CSRF-Protection": "1",
}
BEARER_HEADERS = {"X-Auth-Transport": "bearer"}
PASSWORD = "correct horse battery staple"


@dataclass(slots=True)
class AuthApiContext:
    app: FastAPI
    client: TestClient
    session_factory: SessionFactory

    def db(self) -> Session:
        return self.session_factory()


def _alembic_config(database_url: str) -> Config:
    config = Config(str(BACKEND_ROOT / "alembic.ini"))
    config.attributes["database_url"] = database_url
    return config


@pytest.fixture
def auth_api(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> Generator[AuthApiContext, None, None]:
    database_path = tmp_path / "auth-api.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    command.upgrade(_alembic_config(database_url), "head")
    engine = create_database_engine(database_url)
    session_factory = create_session_factory(engine)

    monkeypatch.setenv("DATABASE_URL", database_url)
    monkeypatch.setenv("BACKEND_CORS_ORIGINS", WEB_ORIGIN)
    monkeypatch.setenv("AUTH_ALLOW_INSECURE_DEV_COOKIE", "true")
    get_settings.cache_clear()

    application = create_app()

    def override_db_session() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    application.dependency_overrides[get_db_session] = override_db_session
    with TestClient(application, base_url="http://testserver") as client:
        yield AuthApiContext(application, client, session_factory)

    application.dependency_overrides.clear()
    get_settings.cache_clear()
    engine.dispose()


def _register(
    auth_api: AuthApiContext,
    *,
    transport: str = "bearer",
    email: str = "person@example.com",
    display_name: str = "테스트 사용자",
    password: str = PASSWORD,
):
    headers = BEARER_HEADERS if transport == "bearer" else COOKIE_HEADERS
    return auth_api.client.post(
        "/api/v1/auth/register",
        headers=headers,
        json={
            "email": email,
            "displayName": display_name,
            "password": password,
        },
    )


def _login(
    auth_api: AuthApiContext,
    *,
    transport: str = "bearer",
    email: str = "person@example.com",
    password: str = PASSWORD,
):
    headers = BEARER_HEADERS if transport == "bearer" else COOKIE_HEADERS
    return auth_api.client.post(
        "/api/v1/auth/login",
        headers=headers,
        json={"email": email, "password": password},
    )


def _bearer_authorization(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@contextmanager
def _client_with_failing_commit(
    auth_api: AuthApiContext,
) -> Generator[TestClient, None, None]:
    original_override = auth_api.app.dependency_overrides[get_db_session]

    def override_db_session() -> Generator[Session, None, None]:
        db = auth_api.session_factory()

        def fail_commit() -> None:
            raise RuntimeError("injected commit failure")

        db.commit = fail_commit  # type: ignore[method-assign]
        try:
            yield db
        finally:
            db.close()

    auth_api.app.dependency_overrides[get_db_session] = override_db_session
    try:
        with TestClient(
            auth_api.app,
            base_url="http://testserver",
            raise_server_exceptions=False,
        ) as client:
            yield client
    finally:
        auth_api.app.dependency_overrides[get_db_session] = original_override


def test_register_cookie_returns_public_account_without_token_field(
    auth_api: AuthApiContext,
) -> None:
    response = _register(auth_api, transport="cookie")

    assert response.status_code == 201
    body = response.json()
    assert body["transport"] == "cookie"
    assert body["user"]["email"] == "person@example.com"
    assert body["user"]["displayName"] == "테스트 사용자"
    assert body["user"]["accountStatus"] == "active"
    assert set(body["user"]) == {
        "id",
        "email",
        "displayName",
        "accountStatus",
        "createdAt",
        "updatedAt",
    }
    assert set(body["session"]) == {"expiresAt"}
    assert "credential" not in body
    assert "token" not in response.text.casefold()
    assert "diet_tracker_session_dev=" in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]
    assert "SameSite=strict" in response.headers["set-cookie"]


def test_register_bearer_returns_raw_token_only_in_credential(
    auth_api: AuthApiContext,
) -> None:
    response = _register(auth_api)

    assert response.status_code == 201
    body = response.json()
    token = body["credential"]["sessionToken"]
    assert body["transport"] == "bearer"
    assert body["credential"]["scheme"] == "Bearer"
    assert "set-cookie" not in response.headers

    with auth_api.db() as db:
        persisted = db.scalar(select(AuthSession.token_hash))
        password_hash = db.scalar(select(User.password_hash))
        assert persisted == hash_session_token(token)
        assert persisted != token
        assert password_hash != PASSWORD
        assert password_service.verify(PASSWORD, password_hash) is True


def test_login_supports_cookie_and_bearer_without_echoing_cookie_token(
    auth_api: AuthApiContext,
) -> None:
    assert _register(auth_api).status_code == 201

    cookie_response = _login(auth_api, transport="cookie")
    assert cookie_response.status_code == 200
    assert cookie_response.json()["transport"] == "cookie"
    assert "credential" not in cookie_response.json()
    assert "token" not in cookie_response.text.casefold()

    auth_api.client.cookies.clear()
    bearer_response = _login(auth_api)
    assert bearer_response.status_code == 200
    assert bearer_response.json()["transport"] == "bearer"
    assert bearer_response.json()["credential"]["sessionToken"]


def test_existing_session_cookie_is_not_issuance_credential_ambiguity(
    auth_api: AuthApiContext,
) -> None:
    assert _register(auth_api, transport="cookie").status_code == 201

    bearer_login = _login(auth_api)
    cookie_login = _login(auth_api, transport="cookie")

    assert bearer_login.status_code == 200
    assert bearer_login.json()["transport"] == "bearer"
    assert cookie_login.status_code == 200
    assert cookie_login.json()["transport"] == "cookie"


def test_browser_origin_cannot_request_bearer_issuance(
    auth_api: AuthApiContext,
) -> None:
    response = auth_api.client.post(
        "/api/v1/auth/register",
        headers={**BEARER_HEADERS, "Origin": WEB_ORIGIN},
        json={
            "email": "blocked@example.com",
            "displayName": "Blocked",
            "password": PASSWORD,
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "request_rejected"
    with auth_api.db() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0


def test_duplicate_registration_uses_database_constraint_and_generic_409(
    auth_api: AuthApiContext,
) -> None:
    assert _register(auth_api, email="Person@Example.com").status_code == 201

    duplicate = _register(
        auth_api,
        email="person@example.COM",
        display_name="다른 이름",
    )

    assert duplicate.status_code == 409
    assert duplicate.json() == {
        "detail": {
            "code": "registration_unavailable",
            "message": "Registration could not be completed.",
        },
    }
    with auth_api.db() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(AuthSession)) == 1


@pytest.mark.parametrize("transport", ["cookie", "bearer"])
def test_register_commit_failure_rolls_back_and_exposes_no_credential(
    auth_api: AuthApiContext,
    monkeypatch: pytest.MonkeyPatch,
    transport: str,
) -> None:
    raw_token = "commit-failure-raw-session-token"
    monkeypatch.setattr("app.security.sessions.generate_session_token", lambda: raw_token)
    headers = BEARER_HEADERS if transport == "bearer" else COOKIE_HEADERS

    with _client_with_failing_commit(auth_api) as client:
        response = client.post(
            "/api/v1/auth/register",
            headers=headers,
            json={
                "email": "rollback@example.com",
                "displayName": "Rollback",
                "password": PASSWORD,
            },
        )

    assert response.status_code == 500
    assert response.json() == {
        "detail": {
            "code": "internal_error",
            "message": "Request could not be completed.",
        },
    }
    assert raw_token not in response.text
    assert "set-cookie" not in response.headers
    assert response.headers["cache-control"] == "no-store"
    with auth_api.db() as db:
        assert db.scalar(select(func.count()).select_from(User)) == 0
        assert db.scalar(select(func.count()).select_from(AuthSession)) == 0


def test_unrelated_integrity_error_is_not_classified_as_duplicate() -> None:
    unrelated = IntegrityError(
        "INSERT INTO auth_sessions (...) VALUES (...) ",
        {},
        RuntimeError("unrelated constraint"),
    )

    assert is_email_identity_unique_violation(unrelated) is False


def test_unknown_wrong_malformed_and_disabled_login_are_indistinguishable(
    auth_api: AuthApiContext,
) -> None:
    assert _register(auth_api).status_code == 201

    responses = [
        _login(auth_api, email="unknown@example.com"),
        _login(auth_api, email="not-an-email"),
        _login(auth_api, password="wrong password"),
    ]
    with auth_api.db() as db:
        user = db.scalar(select(User))
        assert user is not None
        user.account_status = "disabled"
        db.commit()
    responses.append(_login(auth_api))

    assert {response.status_code for response in responses} == {401}
    assert {response.text for response in responses} == {
        '{"detail":{"code":"invalid_credentials","message":"Email or password is invalid."}}',
    }
    with auth_api.db() as db:
        assert db.scalar(select(func.count()).select_from(AuthSession)) == 1


def test_unknown_and_malformed_email_paths_perform_dummy_verification(
    auth_api: AuthApiContext,
) -> None:
    class RecordingPasswords:
        def __init__(self) -> None:
            self.delegate = password_service
            self.verified_hashes: list[str] = []

        def hash(self, password: str) -> str:
            return self.delegate.hash(password)

        def verify(self, password: str, password_hash: str) -> bool:
            self.verified_hashes.append(password_hash)
            return self.delegate.verify(password, password_hash)

        def needs_rehash(self, password_hash: str) -> bool:
            return self.delegate.needs_rehash(password_hash)

    passwords = RecordingPasswords()
    service = AuthService(passwords=passwords)  # type: ignore[arg-type]
    auth_api.app.dependency_overrides[get_auth_service] = lambda: service

    assert _login(auth_api, email="unknown@example.com").status_code == 401
    assert _login(auth_api, email="malformed").status_code == 401

    assert len(passwords.verified_hashes) == 2
    assert passwords.verified_hashes[0] == passwords.verified_hashes[1]
    assert passwords.verified_hashes[0].startswith("$argon2id$")


def test_successful_login_rehashes_an_old_argon2id_hash(
    auth_api: AuthApiContext,
) -> None:
    old_password_service = PasswordService(
        Argon2Hasher(time_cost=1, memory_cost=8, parallelism=1),
    )
    identity = normalize_email_identity("rehash@example.com")
    old_hash = old_password_service.hash(PASSWORD)
    with auth_api.db() as db:
        db.add(
            User(
                email=identity.normalized_email,
                email_identity_key=identity.identity_key,
                display_name="Rehash",
                password_hash=old_hash,
            ),
        )
        db.commit()

    assert _login(auth_api, email="rehash@example.com").status_code == 200

    with auth_api.db() as db:
        current_hash = db.scalar(select(User.password_hash))
        assert current_hash != old_hash
        assert password_service.verify(PASSWORD, current_hash) is True
        assert password_service.needs_rehash(current_hash) is False


def test_login_commit_failure_rolls_back_rehash_and_session(
    auth_api: AuthApiContext,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_password_service = PasswordService(
        Argon2Hasher(time_cost=1, memory_cost=8, parallelism=1),
    )
    identity = normalize_email_identity("rehash-rollback@example.com")
    old_hash = old_password_service.hash(PASSWORD)
    with auth_api.db() as db:
        db.add(
            User(
                email=identity.normalized_email,
                email_identity_key=identity.identity_key,
                display_name="Rehash rollback",
                password_hash=old_hash,
            ),
        )
        db.commit()

    raw_token = "rehash-commit-failure-raw-token"
    monkeypatch.setattr("app.security.sessions.generate_session_token", lambda: raw_token)
    with _client_with_failing_commit(auth_api) as client:
        response = client.post(
            "/api/v1/auth/login",
            headers=BEARER_HEADERS,
            json={"email": identity.normalized_email, "password": PASSWORD},
        )

    assert response.status_code == 500
    assert response.json()["detail"]["code"] == "internal_error"
    assert "injected commit failure" not in response.text
    assert raw_token not in response.text
    assert response.headers["cache-control"] == "no-store"
    with auth_api.db() as db:
        assert db.scalar(select(User.password_hash)) == old_hash
        assert db.scalar(select(func.count()).select_from(AuthSession)) == 0


def test_current_session_accepts_cookie_and_bearer_without_echoing_token(
    auth_api: AuthApiContext,
) -> None:
    cookie_register = _register(auth_api, transport="cookie")
    assert cookie_register.status_code == 201
    cookie_current = auth_api.client.get("/api/v1/auth/session")
    assert cookie_current.status_code == 200
    assert cookie_current.json()["transport"] == "cookie"
    assert "credential" not in cookie_current.json()

    auth_api.client.cookies.clear()
    bearer_login = _login(auth_api)
    token = bearer_login.json()["credential"]["sessionToken"]
    bearer_current = auth_api.client.get(
        "/api/v1/auth/session",
        headers=_bearer_authorization(token),
    )
    assert bearer_current.status_code == 200
    assert bearer_current.json()["transport"] == "bearer"
    assert "credential" not in bearer_current.json()
    assert token not in bearer_current.text


@pytest.mark.parametrize("invalid_state", ["expired", "revoked", "disabled"])
def test_current_session_rejects_invalid_states_without_touching(
    auth_api: AuthApiContext,
    invalid_state: str,
) -> None:
    register = _register(auth_api)
    token = register.json()["credential"]["sessionToken"]
    fixed_last_seen = datetime(2026, 8, 30, 1, 0, tzinfo=timezone.utc)
    with auth_api.db() as db:
        record = db.scalar(select(AuthSession))
        assert record is not None
        record.last_seen_at = fixed_last_seen
        if invalid_state == "expired":
            record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        elif invalid_state == "revoked":
            record.revoked_at = datetime.now(timezone.utc)
        else:
            record.user.account_status = "disabled"
        db.commit()

    response = auth_api.client.get(
        "/api/v1/auth/session",
        headers=_bearer_authorization(token),
    )

    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "unauthenticated"
    with auth_api.db() as db:
        persisted_last_seen = db.scalar(select(AuthSession.last_seen_at))
        assert persisted_last_seen == fixed_last_seen


def test_current_session_touch_is_committed(auth_api: AuthApiContext) -> None:
    register = _register(auth_api)
    token = register.json()["credential"]["sessionToken"]
    old_last_seen = datetime.now(timezone.utc) - timedelta(minutes=5)
    with auth_api.db() as db:
        record = db.scalar(select(AuthSession))
        assert record is not None
        record.last_seen_at = old_last_seen
        db.commit()

    class CountingSessionService(OpaqueSessionService):
        def __init__(self) -> None:
            super().__init__()
            self.validate_calls = 0

        def validate(self, *args: Any, **kwargs: Any):
            self.validate_calls += 1
            return super().validate(*args, **kwargs)

    counting_sessions = CountingSessionService()
    auth_api.app.dependency_overrides[get_auth_service] = lambda: AuthService(
        sessions=counting_sessions,
    )
    original_db_override = auth_api.app.dependency_overrides[get_db_session]
    commit_calls = 0

    def counting_db_session() -> Generator[Session, None, None]:
        nonlocal commit_calls
        db = auth_api.session_factory()
        original_commit = db.commit

        def counted_commit() -> None:
            nonlocal commit_calls
            commit_calls += 1
            original_commit()

        db.commit = counted_commit  # type: ignore[method-assign]
        try:
            yield db
        finally:
            db.close()

    auth_api.app.dependency_overrides[get_db_session] = counting_db_session

    try:
        response = auth_api.client.get(
            "/api/v1/auth/session",
            headers=_bearer_authorization(token),
        )
    finally:
        auth_api.app.dependency_overrides[get_db_session] = original_db_override
        auth_api.app.dependency_overrides.pop(get_auth_service, None)

    assert response.status_code == 200
    assert counting_sessions.validate_calls == 1
    assert commit_calls == 1
    with auth_api.db() as db:
        touched_at = db.scalar(select(AuthSession.last_seen_at))
        assert touched_at > old_last_seen


def test_invalid_cookie_is_deleted(auth_api: AuthApiContext) -> None:
    auth_api.client.cookies.set(
        "diet_tracker_session_dev",
        "invalid-cookie-token",
        domain="testserver.local",
        path="/",
    )

    response = auth_api.client.get("/api/v1/auth/session")

    assert response.status_code == 401
    assert "diet_tracker_session_dev=" in response.headers["set-cookie"]
    assert "Max-Age=0" in response.headers["set-cookie"]
    assert "diet_tracker_session_dev" not in auth_api.client.cookies


def test_logout_is_idempotent_for_bearer(auth_api: AuthApiContext) -> None:
    register = _register(auth_api)
    token = register.json()["credential"]["sessionToken"]
    headers = _bearer_authorization(token)

    first = auth_api.client.delete("/api/v1/auth/session", headers=headers)
    second = auth_api.client.delete("/api/v1/auth/session", headers=headers)

    assert first.status_code == second.status_code == 204
    with auth_api.db() as db:
        revoked_at = db.scalar(select(AuthSession.revoked_at))
        assert revoked_at is not None


def test_logout_returns_204_for_expired_and_unknown_bearer_credentials(
    auth_api: AuthApiContext,
) -> None:
    register = _register(auth_api)
    token = register.json()["credential"]["sessionToken"]
    with auth_api.db() as db:
        record = db.scalar(select(AuthSession))
        assert record is not None
        record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        db.commit()

    expired = auth_api.client.delete(
        "/api/v1/auth/session",
        headers=_bearer_authorization(token),
    )
    unknown = auth_api.client.delete(
        "/api/v1/auth/session",
        headers=_bearer_authorization("unknown-token"),
    )

    assert expired.status_code == unknown.status_code == 204
    with auth_api.db() as db:
        assert db.scalar(select(AuthSession.revoked_at)) is not None


def test_cookie_logout_requires_no_json_content_type_and_always_deletes_cookie(
    auth_api: AuthApiContext,
) -> None:
    assert _register(auth_api, transport="cookie").status_code == 201

    first = auth_api.client.delete(
        "/api/v1/auth/session",
        headers=COOKIE_HEADERS,
    )
    second = auth_api.client.delete(
        "/api/v1/auth/session",
        headers=COOKIE_HEADERS,
    )

    assert first.status_code == second.status_code == 204
    assert "Max-Age=0" in first.headers["set-cookie"]
    assert "Max-Age=0" in second.headers["set-cookie"]
    assert "diet_tracker_session_dev" not in auth_api.client.cookies


@pytest.mark.parametrize("method", ["get", "delete"])
def test_cookie_and_authorization_are_ambiguous(
    auth_api: AuthApiContext,
    method: str,
) -> None:
    assert _register(auth_api, transport="cookie").status_code == 201

    response = getattr(auth_api.client, method)(
        "/api/v1/auth/session",
        headers=_bearer_authorization("another-token"),
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "ambiguous_credentials"


def test_cookie_state_changes_reject_missing_csrf_and_unapproved_origin(
    auth_api: AuthApiContext,
) -> None:
    payload = {
        "email": "guarded@example.com",
        "displayName": "Guarded",
        "password": PASSWORD,
    }
    no_csrf = auth_api.client.post(
        "/api/v1/auth/register",
        headers={"Origin": WEB_ORIGIN},
        json=payload,
    )
    wrong_origin = auth_api.client.post(
        "/api/v1/auth/register",
        headers={"Origin": "https://evil.example", "X-CSRF-Protection": "1"},
        json=payload,
    )

    assert no_csrf.status_code == wrong_origin.status_code == 403
    assert no_csrf.json()["detail"]["code"] == "request_rejected"
    assert wrong_origin.json()["detail"]["code"] == "request_rejected"


def test_cookie_post_requires_application_json(auth_api: AuthApiContext) -> None:
    response = auth_api.client.post(
        "/api/v1/auth/register",
        headers={**COOKIE_HEADERS, "Content-Type": "text/plain"},
        content="not-json",
    )

    assert response.status_code == 415
    assert response.json()["detail"]["code"] == "unsupported_media_type"


def test_bearer_issuance_and_logout_do_not_require_csrf(
    auth_api: AuthApiContext,
) -> None:
    register = _register(auth_api)
    token = register.json()["credential"]["sessionToken"]

    response = auth_api.client.delete(
        "/api/v1/auth/session",
        headers=_bearer_authorization(token),
    )

    assert register.status_code == 201
    assert response.status_code == 204


def test_all_auth_success_and_error_responses_are_no_store(
    auth_api: AuthApiContext,
) -> None:
    success = _register(auth_api)
    failure = _login(auth_api, email="unknown@example.com")
    validation = auth_api.client.post(
        "/api/v1/auth/login",
        headers=BEARER_HEADERS,
        json={"email": "person@example.com"},
    )
    logout = auth_api.client.delete(
        "/api/v1/auth/session",
        headers=_bearer_authorization("unknown-token"),
    )

    assert success.headers["cache-control"] == "no-store"
    assert failure.headers["cache-control"] == "no-store"
    assert validation.headers["cache-control"] == "no-store"
    assert logout.headers["cache-control"] == "no-store"


def test_auth_validation_and_error_boundaries_do_not_leak_secrets(
    auth_api: AuthApiContext,
    caplog: pytest.LogCaptureFixture,
) -> None:
    plaintext = "do-not-leak-this-password"
    token = "do-not-leak-this-session-token"
    validation = auth_api.client.post(
        "/api/v1/auth/login",
        headers=BEARER_HEADERS,
        json={"email": ["wrong-type"], "password": plaintext, "token": token},
    )
    invalid_session = auth_api.client.get(
        "/api/v1/auth/session",
        headers=_bearer_authorization(token),
    )

    assert validation.status_code == 422
    assert validation.json() == {
        "detail": {"code": "invalid_request", "message": "Request is invalid."},
    }
    combined_output = validation.text + invalid_session.text + caplog.text
    assert plaintext not in combined_output
    assert token not in combined_output
    assert "authorization" not in caplog.text.casefold()

    request_dto = LoginRequestDto(email="person@example.com", password=plaintext)
    response_dto = BearerAuthResponseDto(
        user={
            "id": "a39cb927-04ee-49bb-b65c-349e5926a0a8",
            "email": "person@example.com",
            "displayName": "Person",
            "accountStatus": "active",
            "createdAt": "2026-08-31T00:00:00Z",
            "updatedAt": "2026-08-31T00:00:00Z",
        },
        session={"expiresAt": "2026-09-01T00:00:00Z"},
        transport="bearer",
        credential=BearerCredentialDto(sessionToken=token),
    )
    assert plaintext not in repr(request_dto)
    assert token not in repr(response_dto)


def test_food_validation_contract_is_not_sanitized_by_auth_handler(
    auth_api: AuthApiContext,
) -> None:
    response = auth_api.client.get(
        "/api/v1/foods/search",
        params={"q": "바나나", "page": 0},
    )

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], list)
    assert response.json()["detail"][0]["loc"] == ["query", "page"]
    assert response.json()["detail"][0]["input"] == "0"


def test_cors_allows_cookie_headers_but_not_browser_bearer_headers(
    auth_api: AuthApiContext,
) -> None:
    cookie_preflight = auth_api.client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": WEB_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type,x-csrf-protection",
        },
    )
    bearer_preflight = auth_api.client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": WEB_ORIGIN,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,x-auth-transport",
        },
    )

    assert cookie_preflight.status_code == 200
    assert cookie_preflight.headers["access-control-allow-credentials"] == "true"
    assert cookie_preflight.headers["cache-control"] == "no-store"
    assert bearer_preflight.status_code == 400
    assert bearer_preflight.headers["cache-control"] == "no-store"
    allowed_headers = cookie_preflight.headers["access-control-allow-headers"].casefold()
    assert "x-csrf-protection" in allowed_headers
    assert "authorization" not in allowed_headers
    assert "x-auth-transport" not in allowed_headers


def test_production_cookie_defaults_are_host_only_secure_and_http_only() -> None:
    settings = Settings(
        _env_file=None,
        AUTH_ALLOW_INSECURE_DEV_COOKIE=False,
    )
    response = Response()

    set_session_cookie(
        response,
        token="test-cookie-token",
        expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        settings=settings,
    )

    cookie = response.headers["set-cookie"]
    assert cookie.startswith("__Host-diet_tracker_session=")
    assert "Secure" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert "Path=/" in cookie
    assert "Domain=" not in cookie
