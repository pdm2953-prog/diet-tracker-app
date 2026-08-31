from dataclasses import dataclass

from email_validator import EmailNotValidError, validate_email


class EmailIdentityError(ValueError):
    """Raised when an email cannot be used as a login identity."""


@dataclass(frozen=True, slots=True)
class EmailIdentity:
    normalized_email: str
    identity_key: str


def normalize_email_identity(raw_email: str) -> EmailIdentity:
    if not isinstance(raw_email, str):
        raise EmailIdentityError("Email must be a string.")

    candidate = raw_email.strip()
    if not candidate:
        raise EmailIdentityError("Email must not be empty.")

    try:
        result = validate_email(candidate, check_deliverability=False)
    except EmailNotValidError:
        raise EmailIdentityError("Email address is not valid.") from None

    normalized_email = result.normalized
    return EmailIdentity(
        normalized_email=normalized_email,
        identity_key=normalized_email.casefold(),
    )
