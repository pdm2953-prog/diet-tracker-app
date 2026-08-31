from pwdlib.hashers.argon2 import Argon2Hasher


ARGON2_TIME_COST = 2
ARGON2_MEMORY_COST_KIB = 19_456
ARGON2_PARALLELISM = 1


class PasswordValidationError(ValueError):
    """Raised when a value cannot be accepted by the password service."""


class PasswordService:
    def __init__(self, hasher: Argon2Hasher | None = None) -> None:
        self._hasher = hasher or Argon2Hasher(
            time_cost=ARGON2_TIME_COST,
            memory_cost=ARGON2_MEMORY_COST_KIB,
            parallelism=ARGON2_PARALLELISM,
        )

    def hash(self, password: str) -> str:
        _validate_password(password)
        return self._hasher.hash(password)

    def verify(self, password: str, password_hash: str) -> bool:
        _validate_password(password)
        if not self.is_supported_hash(password_hash):
            return False
        return self._hasher.verify(password, password_hash)

    def needs_rehash(self, password_hash: str) -> bool:
        if not self.is_supported_hash(password_hash):
            return True
        return self._hasher.check_needs_rehash(password_hash)

    def is_supported_hash(self, password_hash: str) -> bool:
        return (
            isinstance(password_hash, str)
            and password_hash.startswith("$argon2id$")
            and self._hasher.identify(password_hash)
        )


def _validate_password(password: str) -> None:
    if not isinstance(password, str):
        raise PasswordValidationError("Password must be a string.")
    if not password:
        raise PasswordValidationError("Password must not be empty.")


password_service = PasswordService()


def hash_password(password: str) -> str:
    return password_service.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return password_service.verify(password, password_hash)


def password_needs_rehash(password_hash: str) -> bool:
    return password_service.needs_rehash(password_hash)


def is_supported_password_hash(password_hash: str) -> bool:
    return password_service.is_supported_hash(password_hash)
