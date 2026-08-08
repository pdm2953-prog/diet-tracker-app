import pytest

from app.services.food_name_localization import (
    IdentityFoodNameLocalizer,
    KoreanFoodNameLocalizer,
)


@pytest.fixture
def localizer() -> KoreanFoodNameLocalizer:
    return KoreanFoodNameLocalizer.from_dictionary_file()


@pytest.mark.parametrize(
    ("source_name", "display_name"),
    [
        ("Chicken Breast", "닭가슴살"),
        ("Grilled Chicken Breast", "구운 닭가슴살"),
        ("Chicken Breast, Roasted", "구운 닭가슴살"),
        ("Boneless Skinless Chicken Breast", "뼈·껍질 제거 닭가슴살"),
    ],
)
def test_korean_food_name_localizer_localizes_exact_and_modifier_names(
    localizer: KoreanFoodNameLocalizer,
    source_name: str,
    display_name: str,
) -> None:
    result = localizer.localize(source_name)

    assert result.display_name == display_name
    assert result.source_food_name == source_name
    assert result.was_localized is True
    assert result.display_locale == "ko-KR"
    assert result.localizer_name == "korean_food_name"


def test_korean_food_name_localizer_falls_back_to_original_name(
    localizer: KoreanFoodNameLocalizer,
) -> None:
    result = localizer.localize("Unknown Food")

    assert result.display_name == "Unknown Food"
    assert result.source_food_name == "Unknown Food"
    assert result.was_localized is False
    assert result.display_locale == "ko-KR"
    assert result.localizer_name == "korean_food_name"


def test_identity_food_name_localizer_never_localizes() -> None:
    result = IdentityFoodNameLocalizer().localize("Chicken Breast")

    assert result.display_name == "Chicken Breast"
    assert result.source_food_name == "Chicken Breast"
    assert result.was_localized is False
    assert result.display_locale is None
    assert result.localizer_name == "identity"
