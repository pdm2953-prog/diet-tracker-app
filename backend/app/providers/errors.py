class FoodProviderError(Exception):
    error_code = "food_provider_error"
    public_message = "Food provider is unavailable."
    status_code = 503

    def __init__(
        self,
        public_message: str | None = None,
        *,
        provider_error_code: str | None = None,
        provider_error_type: str | None = None,
        operation: str | None = None,
        api_edition: str | None = None,
        api_method: str | None = None,
    ) -> None:
        if public_message is not None:
            self.public_message = public_message

        self.provider_error_code = provider_error_code
        self.provider_error_type = provider_error_type
        self.operation = operation
        self.api_edition = api_edition
        self.api_method = api_method

        super().__init__(self.public_message)


class FoodProviderConfigurationError(FoodProviderError):
    error_code = "food_provider_configuration_error"
    public_message = "Food provider is not configured correctly."
    status_code = 503


class FoodProviderAuthenticationError(FoodProviderError):
    error_code = "food_provider_authentication_error"
    public_message = "Food provider authentication failed."
    status_code = 502


class FoodProviderPermissionError(FoodProviderError):
    error_code = "food_provider_permission_error"
    public_message = "Food provider permissions are insufficient."
    status_code = 502


class FoodProviderRateLimitError(FoodProviderError):
    error_code = "food_provider_rate_limit_error"
    public_message = "Food provider rate limit was reached."
    status_code = 503


class FoodProviderTimeoutError(FoodProviderError):
    error_code = "food_provider_timeout_error"
    public_message = "Food provider request timed out."
    status_code = 503


class FoodProviderInvalidResponseError(FoodProviderError):
    error_code = "food_provider_invalid_response_error"
    public_message = "Food provider returned an invalid response."
    status_code = 502


class FoodProviderUnavailableError(FoodProviderError):
    error_code = "food_provider_unavailable_error"
    public_message = "Food provider is temporarily unavailable."
    status_code = 503


class FatSecretConfigurationError(FoodProviderConfigurationError):
    error_code = "fatsecret_configuration_error"
    public_message = "FatSecret provider is not configured correctly."


class FatSecretAuthenticationError(FoodProviderAuthenticationError):
    error_code = "fatsecret_authentication_error"
    public_message = "FatSecret authentication failed."


class FatSecretPermissionError(FoodProviderPermissionError):
    error_code = "fatsecret_permission_error"
    public_message = "FatSecret API permissions are insufficient for this request."


class FatSecretRateLimitError(FoodProviderRateLimitError):
    error_code = "fatsecret_rate_limit_error"
    public_message = "FatSecret API rate limit was reached."


class FatSecretTimeoutError(FoodProviderTimeoutError):
    error_code = "fatsecret_timeout_error"
    public_message = "FatSecret API request timed out."


class FatSecretInvalidResponseError(FoodProviderInvalidResponseError):
    error_code = "fatsecret_invalid_response_error"
    public_message = "FatSecret API returned an invalid response."


class FatSecretUnavailableError(FoodProviderUnavailableError):
    error_code = "fatsecret_unavailable_error"
    public_message = "FatSecret API is temporarily unavailable."