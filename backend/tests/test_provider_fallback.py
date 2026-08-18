from app.providers.errors import (
    KfindAuthenticationError,
    KfindConfigurationError,
    KfindInvalidResponseError,
    KfindPermissionError,
    KfindRateLimitError,
    KfindTimeoutError,
    KfindUnavailableError,
)
from app.providers.kfind import (
    KFIND_CATEGORY_AUTH,
    KFIND_CATEGORY_MALFORMED_RESPONSE,
    KFIND_CATEGORY_PERMISSION,
    KFIND_CATEGORY_RATE_LIMIT,
    KFIND_CATEGORY_TIMEOUT,
    KFIND_CATEGORY_UNAVAILABLE,
    KFIND_DATA_SOURCE,
)
from app.services.provider_fallback import (
    ProviderFallbackReason,
    provider_failure_fallback_decision,
    provider_response_fallback_decision,
)


def test_kfind_auth_error_allows_fallback_with_alert_metadata() -> None:
    error = KfindAuthenticationError(
        provider_error_code="30",
        provider_error_type=KFIND_CATEGORY_AUTH,
        operation="search",
    )

    decision = provider_failure_fallback_decision(KFIND_DATA_SOURCE, error)

    assert decision.should_fallback is True
    assert decision.is_provider_failure is True
    assert decision.metadata is not None
    assert decision.metadata.provider == "kfind"
    assert decision.metadata.reason == ProviderFallbackReason.AUTH
    assert decision.metadata.operation == "search"
    assert decision.metadata.upstream_code == "30"
    assert decision.metadata.alert_worthy is True


def test_kfind_permission_error_allows_fallback_with_alert_metadata() -> None:
    error = KfindPermissionError(
        provider_error_code="http_403",
        provider_error_type=KFIND_CATEGORY_PERMISSION,
        operation="auth_check",
    )

    decision = provider_failure_fallback_decision(KFIND_DATA_SOURCE, error)

    assert decision.should_fallback is True
    assert decision.is_provider_failure is True
    assert decision.metadata is not None
    assert decision.metadata.reason == ProviderFallbackReason.PERMISSION
    assert decision.metadata.operation == "auth_check"
    assert decision.metadata.upstream_code == "http_403"
    assert decision.metadata.alert_worthy is True


def test_kfind_rate_limit_error_allows_fallback() -> None:
    error = KfindRateLimitError(
        provider_error_code="22",
        provider_error_type=KFIND_CATEGORY_RATE_LIMIT,
        operation="search",
    )

    decision = provider_failure_fallback_decision(KFIND_DATA_SOURCE, error)

    assert decision.should_fallback is True
    assert decision.is_provider_failure is True
    assert decision.metadata is not None
    assert decision.metadata.reason == ProviderFallbackReason.RATE_LIMIT
    assert decision.metadata.alert_worthy is False


def test_kfind_timeout_error_allows_fallback() -> None:
    error = KfindTimeoutError(
        provider_error_code="http_504",
        provider_error_type=KFIND_CATEGORY_TIMEOUT,
        operation="search",
    )

    decision = provider_failure_fallback_decision(KFIND_DATA_SOURCE, error)

    assert decision.should_fallback is True
    assert decision.is_provider_failure is True
    assert decision.metadata is not None
    assert decision.metadata.reason == ProviderFallbackReason.TIMEOUT


def test_kfind_unavailable_error_allows_fallback() -> None:
    error = KfindUnavailableError(
        provider_error_code="http_500",
        provider_error_type=KFIND_CATEGORY_UNAVAILABLE,
        operation="search",
    )

    decision = provider_failure_fallback_decision(KFIND_DATA_SOURCE, error)

    assert decision.should_fallback is True
    assert decision.is_provider_failure is True
    assert decision.metadata is not None
    assert decision.metadata.reason == ProviderFallbackReason.UNAVAILABLE


def test_kfind_malformed_response_error_allows_fallback_with_alert_metadata() -> None:
    error = KfindInvalidResponseError(
        provider_error_type=KFIND_CATEGORY_MALFORMED_RESPONSE,
        operation="search",
    )

    decision = provider_failure_fallback_decision(KFIND_DATA_SOURCE, error)

    assert decision.should_fallback is True
    assert decision.is_provider_failure is True
    assert decision.metadata is not None
    assert decision.metadata.reason == ProviderFallbackReason.MALFORMED_RESPONSE
    assert decision.metadata.alert_worthy is True


def test_kfind_configuration_error_allows_fallback_but_is_alert_worthy() -> None:
    error = KfindConfigurationError(operation="search")

    decision = provider_failure_fallback_decision(KFIND_DATA_SOURCE, error)

    assert decision.should_fallback is True
    assert decision.is_provider_failure is True
    assert decision.metadata is not None
    assert decision.metadata.reason == ProviderFallbackReason.CONFIGURATION
    assert decision.metadata.alert_worthy is True


def test_kfind_successful_empty_result_is_no_results_not_provider_failure() -> None:
    decision = provider_response_fallback_decision(
        KFIND_DATA_SOURCE,
        [],
        operation="search",
    )

    assert decision.should_fallback is True
    assert decision.is_provider_failure is False
    assert decision.metadata is not None
    assert decision.metadata.reason == ProviderFallbackReason.NO_RESULTS
    assert decision.metadata.provider == "kfind"
    assert decision.metadata.operation == "search"


def test_non_kfind_empty_result_does_not_fallback() -> None:
    decision = provider_response_fallback_decision(
        "fatsecret",
        [],
        operation="search",
    )

    assert decision.should_fallback is False
    assert decision.metadata is None


def test_kfind_successful_non_empty_result_does_not_fallback() -> None:
    decision = provider_response_fallback_decision(
        KFIND_DATA_SOURCE,
        [object()],
        operation="search",
    )

    assert decision.should_fallback is False
    assert decision.metadata is None


def test_unknown_runtime_error_does_not_fallback() -> None:
    decision = provider_failure_fallback_decision(
        KFIND_DATA_SOURCE,
        RuntimeError("unexpected application bug"),
    )

    assert decision.should_fallback is False
    assert decision.metadata is None


def test_type_error_does_not_fallback() -> None:
    decision = provider_failure_fallback_decision(
        KFIND_DATA_SOURCE,
        TypeError("programming error"),
    )

    assert decision.should_fallback is False
    assert decision.metadata is None


def test_fallback_metadata_does_not_leak_secret_url_or_message() -> None:
    secret = "fake-service-key"
    error = KfindTimeoutError(
        f"request failed with {secret}",
        provider_error_code=f"https://example.test/search?serviceKey={secret}",
        provider_error_type=KFIND_CATEGORY_TIMEOUT,
        operation=f"search-{secret}",
    )

    decision = provider_failure_fallback_decision(KFIND_DATA_SOURCE, error)

    assert decision.should_fallback is True
    assert decision.metadata is not None
    assert decision.metadata.upstream_code is None
    assert decision.metadata.operation is None
    assert secret not in repr(decision)
