import re
from dataclasses import dataclass
from enum import StrEnum
from typing import Sequence

from app.providers.errors import (
    KfindAuthenticationError,
    KfindConfigurationError,
    KfindInvalidResponseError,
    KfindPermissionError,
    KfindRateLimitError,
    KfindTimeoutError,
    KfindUnavailableError,
)
from app.providers.interfaces import ProviderName
from app.providers.kfind import KFIND_DATA_SOURCE


class ProviderFallbackReason(StrEnum):
    NO_RESULTS = "no_results"
    CONFIGURATION = "configuration"
    AUTH = "auth"
    PERMISSION = "permission"
    RATE_LIMIT = "rate_limit"
    TIMEOUT = "timeout"
    UNAVAILABLE = "unavailable"
    MALFORMED_RESPONSE = "malformed_response"


@dataclass(frozen=True)
class ProviderFallbackMetadata:
    provider: ProviderName
    reason: ProviderFallbackReason
    operation: str | None = None
    upstream_code: str | None = None
    provider_error_type: str | None = None
    alert_worthy: bool = False


@dataclass(frozen=True)
class ProviderFallbackDecision:
    should_fallback: bool
    metadata: ProviderFallbackMetadata | None = None
    is_provider_failure: bool = False


_SAFE_TOKEN_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")
_SAFE_OPERATIONS = frozenset({"search", "auth_check"})
_SAFE_PROVIDER_ERROR_TYPES = frozenset(reason.value for reason in ProviderFallbackReason)
_SAFE_UPSTREAM_CODE_PATTERN = re.compile(r"^(?:\d{1,4}|http_\d{3})$")
_KFIND_FALLBACK_ERRORS: tuple[tuple[type[Exception], ProviderFallbackReason], ...] = (
    (KfindConfigurationError, ProviderFallbackReason.CONFIGURATION),
    (KfindAuthenticationError, ProviderFallbackReason.AUTH),
    (KfindPermissionError, ProviderFallbackReason.PERMISSION),
    (KfindRateLimitError, ProviderFallbackReason.RATE_LIMIT),
    (KfindTimeoutError, ProviderFallbackReason.TIMEOUT),
    (KfindUnavailableError, ProviderFallbackReason.UNAVAILABLE),
    (KfindInvalidResponseError, ProviderFallbackReason.MALFORMED_RESPONSE),
)
_ALERT_WORTHY_REASONS = frozenset({
    ProviderFallbackReason.CONFIGURATION,
    ProviderFallbackReason.AUTH,
    ProviderFallbackReason.PERMISSION,
    ProviderFallbackReason.MALFORMED_RESPONSE,
})


def provider_failure_fallback_decision(
    provider: ProviderName,
    error: BaseException,
) -> ProviderFallbackDecision:
    if provider != KFIND_DATA_SOURCE:
        return ProviderFallbackDecision(should_fallback=False)

    reason = _kfind_failure_reason(error)

    if reason is None:
        return ProviderFallbackDecision(should_fallback=False)

    return ProviderFallbackDecision(
        should_fallback=True,
        is_provider_failure=True,
        metadata=ProviderFallbackMetadata(
            provider=provider,
            reason=reason,
            operation=_safe_operation(getattr(error, "operation", None)),
            upstream_code=_safe_upstream_code(getattr(error, "provider_error_code", None)),
            provider_error_type=_safe_provider_error_type(getattr(error, "provider_error_type", None)),
            alert_worthy=reason in _ALERT_WORTHY_REASONS,
        ),
    )


def provider_response_fallback_decision(
    provider: ProviderName,
    items: Sequence[object],
    *,
    operation: str,
) -> ProviderFallbackDecision:
    if provider != KFIND_DATA_SOURCE or len(items) > 0:
        return ProviderFallbackDecision(should_fallback=False)

    return ProviderFallbackDecision(
        should_fallback=True,
        is_provider_failure=False,
        metadata=ProviderFallbackMetadata(
            provider=provider,
            reason=ProviderFallbackReason.NO_RESULTS,
            operation=_safe_operation(operation),
        ),
    )


def _kfind_failure_reason(error: BaseException) -> ProviderFallbackReason | None:
    for error_type, reason in _KFIND_FALLBACK_ERRORS:
        if isinstance(error, error_type):
            return reason

    return None


def _safe_token(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    normalized = value.strip()

    if _SAFE_TOKEN_PATTERN.fullmatch(normalized) is None:
        return None

    return normalized


def _safe_operation(value: object) -> str | None:
    normalized = _safe_token(value)

    if normalized not in _SAFE_OPERATIONS:
        return None

    return normalized


def _safe_provider_error_type(value: object) -> str | None:
    normalized = _safe_token(value)

    if normalized not in _SAFE_PROVIDER_ERROR_TYPES:
        return None

    return normalized


def _safe_upstream_code(value: object) -> str | None:
    normalized = _safe_token(value)

    if normalized is None:
        return None

    if _SAFE_UPSTREAM_CODE_PATTERN.fullmatch(normalized) is None:
        return None

    return normalized