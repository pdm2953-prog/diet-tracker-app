from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import foods, health
from app.core.config import get_settings
from app.providers.errors import FoodProviderError


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)

    app.add_exception_handler(FoodProviderError, food_provider_exception_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(foods.router, prefix=settings.api_v1_prefix)

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


app = create_app()
