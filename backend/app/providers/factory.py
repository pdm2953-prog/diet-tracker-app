from functools import lru_cache

from app.core.config import Settings, get_settings
from app.providers.errors import FoodProviderConfigurationError
from app.providers.fatsecret import FatSecretFoodProvider, FatSecretProviderConfig
from app.providers.interfaces import FoodProvider
from app.providers.kfind import KfindFoodProvider, KfindProviderConfig
from app.providers.mock import MockFoodProvider


SUPPORTED_FOOD_PROVIDERS = ("mock", "fatsecret")


def create_food_provider(settings: Settings | None = None) -> FoodProvider:
    resolved_settings = settings or get_settings()
    provider_name = resolved_settings.food_provider.strip().casefold()

    if provider_name == "mock":
        return MockFoodProvider()

    if provider_name == "fatsecret":
        return FatSecretFoodProvider(
            FatSecretProviderConfig.from_settings(resolved_settings),
        )

    raise FoodProviderConfigurationError(
        "FOOD_PROVIDER must be one of: mock, fatsecret.",
    )


def create_kfind_food_provider(settings: Settings | None = None) -> FoodProvider:
    resolved_settings = settings or get_settings()

    return KfindFoodProvider(
        KfindProviderConfig.from_settings(resolved_settings),
    )


@lru_cache
def get_food_provider() -> FoodProvider:
    return create_food_provider(get_settings())


@lru_cache
def get_kfind_food_provider() -> FoodProvider:
    return create_kfind_food_provider(get_settings())
