from typing import Annotated

from fastapi import APIRouter, Depends, Request, Response, status
from fastapi.routing import APIRoute
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import Settings, get_settings
from app.db.models import AuthSession, User
from app.db.session import get_db_session
from app.models.auth import (
    BearerAuthResponseDto,
    BearerCredentialDto,
    CookieAuthResponseDto,
    CurrentSessionResponseDto,
    IssuedAuthResponseDto,
    LoginRequestDto,
    RegisterRequestDto,
    SessionExpiryDto,
    UserAccountDto,
)
from app.security.auth_http import (
    AuthApiError,
    clear_session_cookie,
    enforce_cookie_state_change,
    resolve_issuance_transport,
    resolve_request_credential,
    set_session_cookie,
)
from app.services.auth import (
    AuthService,
    InvalidCredentialsError,
    InvalidRegistrationError,
    get_auth_service,
    is_email_identity_unique_violation,
)


class AuthRoute(APIRoute):
    """Apply issuance guards before FastAPI reads or validates credential bodies."""

    def get_route_handler(self):
        original_route_handler = super().get_route_handler()

        async def guarded_route_handler(request: Request):
            if request.method == "POST":
                settings = get_settings()
                transport = resolve_issuance_transport(request)
                if transport == "cookie":
                    enforce_cookie_state_change(request, settings, require_json=True)
                request.state.auth_issuance_transport = transport
            return await original_route_handler(request)

        return guarded_route_handler


router = APIRouter(prefix="/auth", tags=["auth"], route_class=AuthRoute)


@router.post(
    "/register",
    response_model=IssuedAuthResponseDto,
    status_code=status.HTTP_201_CREATED,
)
def register(
    payload: RegisterRequestDto,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db_session)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CookieAuthResponseDto | BearerAuthResponseDto:
    transport = request.state.auth_issuance_transport

    try:
        result = auth_service.register(
            db,
            email=payload.email,
            display_name=payload.displayName,
            password=payload.password.get_secret_value(),
        )
        db.commit()
    except InvalidRegistrationError:
        db.rollback()
        raise AuthApiError(
            status_code=422,
            code="invalid_request",
            message="Request is invalid.",
        ) from None
    except IntegrityError as exc:
        db.rollback()
        if is_email_identity_unique_violation(exc):
            raise AuthApiError(
                status_code=409,
                code="registration_unavailable",
                message="Registration could not be completed.",
            ) from None
        raise

    if transport == "cookie":
        set_session_cookie(
            response,
            token=result.session.token,
            expires_at=result.session.record.expires_at,
            settings=settings,
        )
    return _issued_response(result.user, result.session.record, result.session.token, transport)


@router.post("/login", response_model=IssuedAuthResponseDto)
def login(
    payload: LoginRequestDto,
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db_session)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CookieAuthResponseDto | BearerAuthResponseDto:
    transport = request.state.auth_issuance_transport

    try:
        result = auth_service.login(
            db,
            email=payload.email,
            password=payload.password.get_secret_value(),
        )
        db.commit()
    except InvalidCredentialsError:
        db.rollback()
        raise AuthApiError(
            status_code=401,
            code="invalid_credentials",
            message="Email or password is invalid.",
        ) from None

    if transport == "cookie":
        set_session_cookie(
            response,
            token=result.session.token,
            expires_at=result.session.record.expires_at,
            settings=settings,
        )
    return _issued_response(result.user, result.session.record, result.session.token, transport)


@router.get("/session", response_model=CurrentSessionResponseDto)
def current_session(
    request: Request,
    db: Annotated[Session, Depends(get_db_session)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CurrentSessionResponseDto:
    credential = resolve_request_credential(request, settings)
    record = (
        auth_service.sessions.validate(db, credential.token, touch=True)
        if credential.token is not None
        else None
    )
    if record is None:
        db.rollback()
        raise AuthApiError(
            status_code=401,
            code="unauthenticated",
            message="Authentication is required.",
            clear_session_cookie=(
                credential.transport == "cookie" and credential.is_present
            ),
        )

    db.commit()
    return CurrentSessionResponseDto(
        user=_user_dto(record.user),
        session=SessionExpiryDto(expiresAt=record.expires_at),
        transport=credential.transport,
    )


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    db: Annotated[Session, Depends(get_db_session)],
    auth_service: Annotated[AuthService, Depends(get_auth_service)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> None:
    credential = resolve_request_credential(request, settings)
    if credential.transport == "cookie":
        enforce_cookie_state_change(request, settings, require_json=False)

    if credential.token is not None:
        auth_service.sessions.revoke(db, credential.token)
    db.commit()

    if credential.transport == "cookie":
        clear_session_cookie(response, settings)


def _issued_response(
    user: User,
    record: AuthSession,
    raw_token: str,
    transport: str,
) -> CookieAuthResponseDto | BearerAuthResponseDto:
    user_dto = _user_dto(user)
    expiry_dto = SessionExpiryDto(expiresAt=record.expires_at)
    if transport == "bearer":
        return BearerAuthResponseDto(
            user=user_dto,
            session=expiry_dto,
            transport="bearer",
            credential=BearerCredentialDto(sessionToken=raw_token),
        )
    return CookieAuthResponseDto(
        user=user_dto,
        session=expiry_dto,
        transport="cookie",
    )


def _user_dto(user: User) -> UserAccountDto:
    return UserAccountDto(
        id=user.id,
        email=user.email,
        displayName=user.display_name,
        accountStatus=user.account_status,
        createdAt=user.created_at,
        updatedAt=user.updated_at,
    )
