from fastapi import FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, PlainTextResponse

from app.api import auth, foods, health
from app.core.config import Settings, get_settings
from app.providers.errors import FoodProviderError
from app.security.auth_http import AuthApiError, clear_session_cookie


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)

    app.add_exception_handler(FoodProviderError, food_provider_exception_handler)
    app.add_exception_handler(AuthApiError, auth_api_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
        allow_headers=["Accept", "Content-Type", "X-CSRF-Protection"],
    )

    @app.middleware("http")
    async def add_auth_cache_policy(request: Request, call_next):
        response = await call_next(request)
        if _is_auth_path(request, settings):
            response.headers["Cache-Control"] = "no-store"
        return response

    app.include_router(health.router)
    app.include_router(foods.router, prefix=settings.api_v1_prefix)
    app.include_router(auth.router, prefix=settings.api_v1_prefix)

    return app


async def food_provider_exception_handler(
    _request: Request,
    exc: FoodProviderError,
) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": {
                "code": exc.error_code,
                "message": exc.public_message,
            },
        },
    )


async def auth_api_exception_handler(
    _request: Request,
    exc: AuthApiError,
) -> JSONResponse:
    response = JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": {
                "code": exc.code,
                "message": exc.public_message,
            },
        },
    )
    if exc.clear_session_cookie:
        clear_session_cookie(response, get_settings())
    return response


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
):
    settings = get_settings()
    if _is_auth_path(request, settings):
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "code": "invalid_request",
                    "message": "Request is invalid.",
                },
            },
        )
    return await request_validation_exception_handler(request, exc)


async def unhandled_exception_handler(
    request: Request,
    _exc: Exception,
):
    settings = get_settings()
    if _is_auth_path(request, settings):
        return JSONResponse(
            status_code=500,
            content={
                "detail": {
                    "code": "internal_error",
                    "message": "Request could not be completed.",
                },
            },
            headers={"Cache-Control": "no-store"},
        )
    return PlainTextResponse("Internal Server Error", status_code=500)


def _is_auth_path(request: Request, settings: Settings) -> bool:
    auth_prefix = f"{settings.api_v1_prefix.rstrip('/')}/auth"
    return request.url.path == auth_prefix or request.url.path.startswith(
        f"{auth_prefix}/",
    )


app = create_app()
