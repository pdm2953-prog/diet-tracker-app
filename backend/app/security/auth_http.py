from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Literal

from fastapi import Request, Response

from app.core.config import Settings


AUTH_TRANSPORT_HEADER = "X-Auth-Transport"
CSRF_HEADER = "X-CSRF-Protection"
CSRF_HEADER_VALUE = "1"

AuthTransport = Literal["cookie", "bearer"]


class AuthApiError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        clear_session_cookie: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.public_message = message
        self.clear_session_cookie = clear_session_cookie


@dataclass(frozen=True, slots=True)
class RequestCredential:
    transport: AuthTransport
    token: str | None = field(repr=False)
    is_present: bool


def resolve_issuance_transport(request: Request) -> AuthTransport:
    requested_transport = request.headers.get(AUTH_TRANSPORT_HEADER)
    if requested_transport is None:
        return "cookie"
    if requested_transport.strip().casefold() != "bearer":
        raise AuthApiError(
            status_code=400,
            code="invalid_transport",
            message="Authentication transport is invalid.",
        )
    if request.headers.get("origin") is not None:
        raise AuthApiError(
            status_code=403,
            code="request_rejected",
            message="Request could not be accepted.",
        )
    return "bearer"


def resolve_request_credential(
    request: Request,
    settings: Settings,
) -> RequestCredential:
    cookie_name = settings.auth_session_cookie_name
    cookie_is_present = cookie_name in request.cookies
    cookie_token = request.cookies.get(cookie_name)
    authorization = request.headers.get("authorization")

    if cookie_is_present and authorization is not None:
        raise AuthApiError(
            status_code=400,
            code="ambiguous_credentials",
            message="Multiple authentication credentials were provided.",
        )

    if authorization is not None:
        return RequestCredential(
            transport="bearer",
            token=_parse_bearer_token(authorization),
            is_present=True,
        )

    return RequestCredential(
        transport="cookie",
        token=cookie_token if cookie_token else None,
        is_present=cookie_is_present,
    )


def enforce_cookie_state_change(
    request: Request,
    settings: Settings,
    *,
    require_json: bool,
) -> None:
    if require_json:
        media_type = request.headers.get("content-type", "").split(";", 1)[0]
        if media_type.strip().casefold() != "application/json":
            raise AuthApiError(
                status_code=415,
                code="unsupported_media_type",
                message="Content-Type must be application/json.",
            )

    if request.headers.get(CSRF_HEADER) != CSRF_HEADER_VALUE:
        raise AuthApiError(
            status_code=403,
            code="request_rejected",
            message="Request could not be accepted.",
        )

    origin = request.headers.get("origin")
    if origin is None or origin not in settings.cors_origins:
        raise AuthApiError(
            status_code=403,
            code="request_rejected",
            message="Request could not be accepted.",
        )


def set_session_cookie(
    response: Response,
    *,
    token: str,
    expires_at: datetime,
    settings: Settings,
) -> None:
    response.set_cookie(
        key=settings.auth_session_cookie_name,
        value=token,
        expires=expires_at,
        max_age=settings.auth_session_absolute_ttl_seconds,
        path="/",
        secure=settings.auth_session_cookie_secure,
        httponly=True,
        samesite="strict",
    )


def clear_session_cookie(response: Response, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.auth_session_cookie_name,
        path="/",
        secure=settings.auth_session_cookie_secure,
        httponly=True,
        samesite="strict",
    )


def _parse_bearer_token(value: str) -> str | None:
    parts = value.split()
    if len(parts) != 2 or parts[0].casefold() != "bearer":
        return None
    return parts[1] or None
