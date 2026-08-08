from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_CORS_ORIGINS = (
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8082",
    "http://127.0.0.1:8082",
)


class Settings(BaseSettings):
    app_name: str = Field(default="Diet Tracker Backend", validation_alias="APP_NAME")
    app_version: str = Field(default="0.1.0", validation_alias="APP_VERSION")
    api_v1_prefix: str = Field(default="/api/v1", validation_alias="API_V1_PREFIX")
    backend_cors_origins: str = Field(
        default=",".join(DEFAULT_CORS_ORIGINS),
        validation_alias="BACKEND_CORS_ORIGINS",
    )
    food_provider: str = Field(default="mock", validation_alias="FOOD_PROVIDER")
    fatsecret_api_edition: str = Field(
        default="basic",
        validation_alias="FATSECRET_API_EDITION",
    )
    fatsecret_client_id: str | None = Field(default=None, validation_alias="FATSECRET_CLIENT_ID")
    fatsecret_client_secret: str | None = Field(
        default=None,
        validation_alias="FATSECRET_CLIENT_SECRET",
    )
    fatsecret_region: str | None = Field(default=None, validation_alias="FATSECRET_REGION")
    fatsecret_language: str | None = Field(default=None, validation_alias="FATSECRET_LANGUAGE")
    fatsecret_timeout_seconds: float = Field(
        default=10.0,
        validation_alias="FATSECRET_TIMEOUT_SECONDS",
    )
    fatsecret_token_refresh_margin_seconds: float = Field(
        default=60.0,
        validation_alias="FATSECRET_TOKEN_REFRESH_MARGIN_SECONDS",
    )
    fatsecret_basic_max_results: int = Field(
        default=10,
        validation_alias="FATSECRET_BASIC_MAX_RESULTS",
    )
    fatsecret_detail_concurrency: int = Field(
        default=4,
        validation_alias="FATSECRET_DETAIL_CONCURRENCY",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins(self) -> list[str]:
        origins = [
            origin.strip()
            for origin in self.backend_cors_origins.split(",")
            if origin.strip()
        ]

        if any(origin == "*" for origin in origins):
            raise ValueError("Wildcard CORS origins are not allowed.")

        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
