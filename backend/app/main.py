from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import foods, health
from app.core.config import get_settings


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version=settings.app_version)

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


app = create_app()
