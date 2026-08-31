from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from io import StringIO
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from pwdlib.hashers.argon2 import Argon2Hasher
from sqlalchemy import delete, inspect, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.models import AuthSession, User
from app.db.session import create_database_engine, create_session_factory
from app.security.email_identity import EmailIdentityError, normalize_email_identity
from app.security.passwords import PasswordService, password_service
from app.security.sessions import (
    OpaqueSessionService,
    SessionPolicy,
    hash_session_token,
)


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TEST_USER_PASSWORD = "test-only fixture password"
PASSWORD_HASH_PLACEHOLDER = password_service.hash(TEST_USER_PASSWORD)
BASE_TIME = datetime(2026, 8, 31, 3, 0, tzinfo=timezone.utc)


def make_alembic_config(
    database_url: str,
    *,
    output_buffer: StringIO | None = None,
) -> Config:
    alembic_config = Config(
        str(BACKEND_ROOT / "alembic.ini"),
        output_buffer=output_buffer,
    )
    alembic_config.attributes["database_url"] = database_url
    return alembic_config


@pytest.fixture
def migrated_database_url(tmp_path: Path) -> str:
    database_path = tmp_path / "auth-foundation.db"
    database_url = f"sqlite+pysqlite:///{database_path.as_posix()}"
    command.upgrade(make_alembic_config(database_url), "head")
    return database_url


@pytest.fixture
def db(migrated_database_url: str) -> Generator[Session, None, None]:
    engine = create_database_engine(migrated_database_url)
    session = create_session_factory(engine)()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


def make_user(
    *,
    email: str = "person@example.com",
    display_name: str = "테스트 사용자",
) -> User:
    identity = normalize_email_identity(email)
    return User(
        email=identity.normalized_email,
        email_identity_key=identity.identity_key,
        display_name=display_name,
        password_hash=PASSWORD_HASH_PLACEHOLDER,
    )


def add_user(db: Session, **kwargs: str) -> User:
    user = make_user(**kwargs)
    db.add(user)
    db.flush()
    return user


def test_migration_creates_users_and_auth_sessions(
    migrated_database_url: str,
) -> None:
    engine = create_database_engine(migrated_database_url)
    inspector = inspect(engine)

    try:
        command.check(make_alembic_config(migrated_database_url))
        assert {"alembic_version", "users", "auth_sessions"} <= set(
            inspector.get_table_names(),
        )
        assert {column["name"] for column in inspector.get_columns("users")} == {
            "id",
            "email",
            "email_identity_key",
            "display_name",
            "password_hash",
            "account_status",
            "created_at",
            "updated_at",
        }
        assert {
            column["name"] for column in inspector.get_columns("auth_sessions")
        } == {
            "id",
            "user_id",
            "token_hash",
            "created_at",
            "last_seen_at",
            "expires_at",
            "revoked_at",
        }
        unique_constraints = {
            constraint["name"]: constraint["column_names"]
            for constraint in inspector.get_unique_constraints("auth_sessions")
        }
        assert unique_constraints["uq_auth_sessions_token_hash"] == ["token_hash"]
    finally:
        engine.dispose()


def test_migration_upgrade_downgrade_upgrade_cycle(
    migrated_database_url: str,
) -> None:
    alembic_config = make_alembic_config(migrated_database_url)

    command.downgrade(alembic_config, "base")
    downgraded_engine = create_database_engine(migrated_database_url)
    try:
        downgraded_tables = set(inspect(downgraded_engine).get_table_names())
        assert "users" not in downgraded_tables
        assert "auth_sessions" not in downgraded_tables
    finally:
        downgraded_engine.dispose()

    command.upgrade(alembic_config, "head")
    command.check(alembic_config)
    upgraded_engine = create_database_engine(migrated_database_url)
    try:
        assert {"users", "auth_sessions"} <= set(
            inspect(upgraded_engine).get_table_names(),
        )
    finally:
        upgraded_engine.dispose()


def test_initial_migration_emits_postgresql_compatible_ddl() -> None:
    output = StringIO()
    alembic_config = make_alembic_config(
        "postgresql://user:password@example.invalid/diet_tracker",
        output_buffer=output,
    )

    command.upgrade(alembic_config, "head", sql=True)
    ddl = output.getvalue()

    assert "UUID" in ddl
    assert "TIMESTAMP WITH TIME ZONE" in ddl
    assert "FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE" in ddl
    assert "CONSTRAINT uq_auth_sessions_token_hash UNIQUE (token_hash)" in ddl


def test_email_identity_is_trimmed_normalized_and_case_insensitive() -> None:
    first = normalize_email_identity("  Person@Example.COM  ")
    second = normalize_email_identity("person@example.com")

    assert first.normalized_email == "Person@example.com"
    assert first.identity_key == second.identity_key == "person@example.com"


def test_email_identity_does_not_apply_provider_specific_rewriting() -> None:
    identity = normalize_email_identity("First.Last+me@GMAIL.com")

    assert identity.normalized_email == "First.Last+me@gmail.com"
    assert identity.identity_key == "first.last+me@gmail.com"


@pytest.mark.parametrize(
    "email",
    ["", "   ", "not-an-email", "missing-domain@", "@missing-local.example"],
)
def test_malformed_email_is_rejected(email: str) -> None:
    with pytest.raises(EmailIdentityError):
        normalize_email_identity(email)


def test_email_identity_key_has_database_backed_case_insensitive_uniqueness(
    db: Session,
) -> None:
    db.add(make_user(email="Person@Example.com"))
    db.commit()

    db.add(make_user(email="person@example.COM", display_name="중복 사용자"))
    with pytest.raises(IntegrityError):
        db.flush()


def test_password_hash_is_argon2id_and_not_plaintext() -> None:
    plaintext = "correct horse battery staple"
    password_hash = password_service.hash(plaintext)

    assert password_hash != plaintext
    assert password_hash.startswith("$argon2id$")
    assert password_service.verify(plaintext, password_hash) is True
    assert password_service.verify("wrong password", password_hash) is False


def test_user_persists_only_password_hash(db: Session) -> None:
    add_user(db)
    db.commit()

    persisted_hash = db.scalar(select(User.password_hash))

    assert persisted_hash == PASSWORD_HASH_PLACEHOLDER
    assert persisted_hash != TEST_USER_PASSWORD


def test_user_orm_rejects_plaintext_before_persistence() -> None:
    identity = normalize_email_identity("plaintext@example.com")

    with pytest.raises(ValueError) as error:
        User(
            email=identity.normalized_email,
            email_identity_key=identity.identity_key,
            display_name="Plaintext test",
            password_hash=TEST_USER_PASSWORD,
        )

    assert TEST_USER_PASSWORD not in str(error.value)
    assert "Argon2id PHC" in str(error.value)


def test_password_needs_rehash_is_available() -> None:
    old_service = PasswordService(
        Argon2Hasher(time_cost=1, memory_cost=8, parallelism=1),
    )
    old_hash = old_service.hash("rehash me")

    assert password_service.needs_rehash(old_hash) is True
    assert isinstance(password_service.needs_rehash(password_service.hash("current")), bool)


def test_session_persists_only_token_hash(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(hours=1), absolute_timeout=timedelta(days=1)),
    )

    issued = service.create(db, user.id, now=BASE_TIME)
    db.commit()
    persisted_hash = db.scalar(select(AuthSession.token_hash))

    assert issued.token != persisted_hash
    assert persisted_hash == hash_session_token(issued.token)
    assert len(persisted_hash) == 64
    assert "token" not in {column.name for column in AuthSession.__table__.columns}
    assert issued.token not in repr(issued)


def test_valid_session_can_be_looked_up_and_touched(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(minutes=30), absolute_timeout=timedelta(hours=2)),
    )
    issued = service.create(db, user.id, now=BASE_TIME)

    looked_up = service.lookup(db, issued.token)
    validated = service.validate(db, issued.token, now=BASE_TIME + timedelta(minutes=10))

    assert looked_up is not None
    assert looked_up.id == issued.record.id
    assert validated is not None
    assert validated.user_id == user.id
    assert validated.last_seen_at == BASE_TIME + timedelta(minutes=10)


def test_idle_window_rolls_forward_after_sqlite_round_trip(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(
            idle_timeout=timedelta(minutes=15),
            absolute_timeout=timedelta(hours=1),
        ),
    )
    issued = service.create(db, user.id, now=BASE_TIME)
    db.commit()
    db.expunge_all()

    touched = service.validate(
        db,
        issued.token,
        now=BASE_TIME + timedelta(minutes=10),
    )
    assert touched is not None
    db.commit()
    db.expunge_all()

    assert service.validate(
        db,
        issued.token,
        now=BASE_TIME + timedelta(minutes=24),
        touch=False,
    ) is not None
    assert service.validate(
        db,
        issued.token,
        now=BASE_TIME + timedelta(minutes=25),
        touch=False,
    ) is None


def test_last_seen_touch_never_overwrites_a_newer_persisted_value(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(hours=1), absolute_timeout=timedelta(days=1)),
    )
    issued = service.create(db, user.id, now=BASE_TIME)
    stale_record = service.lookup(db, issued.token)
    assert stale_record is not None

    newer_last_seen_at = BASE_TIME + timedelta(minutes=20)
    db.execute(
        update(AuthSession)
        .where(AuthSession.id == issued.record.id)
        .values(last_seen_at=newer_last_seen_at)
        .execution_options(synchronize_session=False),
    )
    assert stale_record.last_seen_at == BASE_TIME

    validated = service.validate(
        db,
        issued.token,
        now=BASE_TIME + timedelta(minutes=10),
    )

    assert validated is not None
    assert validated.last_seen_at == newer_last_seen_at
    assert db.scalar(select(AuthSession.last_seen_at)) == newer_last_seen_at


def test_auth_timestamps_round_trip_as_aware_utc_in_sqlite(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(hours=1), absolute_timeout=timedelta(days=1)),
    )
    korea_time = BASE_TIME.astimezone(timezone(timedelta(hours=9)))
    issued = service.create(db, user.id, now=korea_time)
    user_id = user.id
    session_id = issued.record.id
    db.commit()
    db.expunge_all()

    loaded_user = db.get(User, user_id)
    loaded_session = db.get(AuthSession, session_id)

    assert loaded_user is not None
    assert loaded_session is not None
    timestamps = (
        loaded_user.created_at,
        loaded_user.updated_at,
        loaded_session.created_at,
        loaded_session.last_seen_at,
        loaded_session.expires_at,
    )
    assert all(value.tzinfo is not None for value in timestamps)
    assert all(value.utcoffset() == timedelta(0) for value in timestamps)
    assert loaded_session.created_at == BASE_TIME
    assert loaded_session.last_seen_at == BASE_TIME


def test_session_clock_rejects_naive_datetime(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(hours=1), absolute_timeout=timedelta(days=1)),
    )
    issued = service.create(db, user.id, now=BASE_TIME)

    with pytest.raises(ValueError, match="timezone-aware"):
        service.validate(db, issued.token, now=BASE_TIME.replace(tzinfo=None))


def test_absolute_expired_session_is_invalid(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(hours=1), absolute_timeout=timedelta(minutes=30)),
    )
    issued = service.create(db, user.id, now=BASE_TIME)

    assert service.validate(
        db,
        issued.token,
        now=BASE_TIME + timedelta(minutes=30),
    ) is None


def test_idle_expired_session_is_invalid(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(minutes=5), absolute_timeout=timedelta(hours=1)),
    )
    issued = service.create(db, user.id, now=BASE_TIME)

    assert service.validate(
        db,
        issued.token,
        now=BASE_TIME + timedelta(minutes=5),
    ) is None


def test_revoked_session_is_invalid_and_revoke_is_idempotent(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(hours=1), absolute_timeout=timedelta(days=1)),
    )
    issued = service.create(db, user.id, now=BASE_TIME)

    assert service.revoke(db, issued.token, now=BASE_TIME + timedelta(minutes=1)) is True
    assert service.revoke(db, issued.token, now=BASE_TIME + timedelta(minutes=2)) is True
    assert service.validate(db, issued.token, now=BASE_TIME + timedelta(minutes=2)) is None
    assert issued.record.revoked_at == BASE_TIME + timedelta(minutes=1)


def test_auth_session_foreign_key_rejects_unknown_user(db: Session) -> None:
    db.add(
        AuthSession(
            user_id=uuid4(),
            token_hash=hash_session_token("unknown-user-token"),
            created_at=BASE_TIME,
            last_seen_at=BASE_TIME,
            expires_at=BASE_TIME + timedelta(days=1),
        ),
    )

    with pytest.raises(IntegrityError):
        db.flush()


def test_deleting_user_cascades_to_auth_sessions(db: Session) -> None:
    user = add_user(db)
    service = OpaqueSessionService(
        SessionPolicy(idle_timeout=timedelta(hours=1), absolute_timeout=timedelta(days=1)),
    )
    issued = service.create(db, user.id, now=BASE_TIME)
    session_id = issued.record.id
    db.commit()

    db.execute(delete(User).where(User.id == user.id))
    db.commit()
    db.expire_all()

    assert db.get(AuthSession, session_id) is None
