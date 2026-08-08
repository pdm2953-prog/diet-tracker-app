from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Protocol


DEFAULT_KOREAN_FOOD_NAME_LOCALIZATION_PATH = (
    Path(__file__).resolve().parent.parent
    / "data"
    / "korean_food_name_localization.json"
)
WHITESPACE_PATTERN = re.compile(r"\s+")
COMMA_SPACING_PATTERN = re.compile(r"\s*,\s*")


@dataclass(frozen=True)
class FoodNameLocalization:
    display_name: str
    source_food_name: str
    was_localized: bool
    display_locale: str | None
    localizer_name: str


class FoodNameLocalizer(Protocol):
    @property
    def localizer_name(self) -> str:
        raise NotImplementedError

    def localize(self, source_food_name: str) -> FoodNameLocalization:
        raise NotImplementedError


class IdentityFoodNameLocalizer:
    def __init__(self, display_locale: str | None = None) -> None:
        self._display_locale = display_locale

    @property
    def localizer_name(self) -> str:
        return "identity"

    def localize(self, source_food_name: str) -> FoodNameLocalization:
        return FoodNameLocalization(
            display_name=source_food_name,
            source_food_name=source_food_name,
            was_localized=False,
            display_locale=self._display_locale,
            localizer_name=self.localizer_name,
        )


class KoreanFoodNameLocalizer:
    def __init__(
        self,
        *,
        display_locale: str,
        exact_phrases: dict[str, str],
        foods: dict[str, str],
        modifiers: dict[str, str],
    ) -> None:
        self._display_locale = display_locale
        self._exact_phrases = _normalize_dictionary(exact_phrases, "exactPhrases")
        self._foods = _normalize_dictionary(foods, "foods")
        self._modifiers = _normalize_dictionary(modifiers, "modifiers")
        self._food_keys = tuple(
            sorted(self._foods.keys(), key=lambda value: (-len(value), value))
        )
        self._modifier_keys = tuple(
            sorted(self._modifiers.keys(), key=lambda value: (-len(value), value))
        )

    @property
    def localizer_name(self) -> str:
        return "korean_food_name"

    @classmethod
    def from_dictionary_file(
        cls,
        path: Path = DEFAULT_KOREAN_FOOD_NAME_LOCALIZATION_PATH,
    ) -> "KoreanFoodNameLocalizer":
        return cls(**_load_korean_food_name_dictionary(path))

    def localize(self, source_food_name: str) -> FoodNameLocalization:
        normalized_name = normalize_food_name_lookup_key(source_food_name)
        display_name = self._exact_phrases.get(normalized_name)

        if display_name is None:
            display_name = self._localize_modifier_food_name(normalized_name)

        if display_name is None:
            return FoodNameLocalization(
                display_name=source_food_name,
                source_food_name=source_food_name,
                was_localized=False,
                display_locale=self._display_locale,
                localizer_name=self.localizer_name,
            )

        return FoodNameLocalization(
            display_name=display_name,
            source_food_name=source_food_name,
            was_localized=True,
            display_locale=self._display_locale,
            localizer_name=self.localizer_name,
        )

    def _localize_modifier_food_name(self, normalized_name: str) -> str | None:
        comma_parts = tuple(
            part.strip()
            for part in normalized_name.split(",")
            if part.strip() != ""
        )

        if len(comma_parts) == 2:
            localized_name = self._localize_food_with_modifier_suffix(
                food_name=comma_parts[0],
                modifier_text=comma_parts[1],
            )

            if localized_name is not None:
                return localized_name

        return self._localize_modifier_food_phrase(
            normalize_food_name_lookup_key(normalized_name.replace(",", " "))
        )

    def _localize_food_with_modifier_suffix(
        self,
        *,
        food_name: str,
        modifier_text: str,
    ) -> str | None:
        if food_name not in self._foods:
            return None

        modifiers = self._segment_modifiers(modifier_text)

        if modifiers is None:
            return None

        return self._format_display_name(modifiers, self._foods[food_name])

    def _localize_modifier_food_phrase(self, normalized_name: str) -> str | None:
        for food_key in self._food_keys:
            prefix = f"{food_key} "
            suffix = f" {food_key}"

            if normalized_name.startswith(prefix):
                modifiers = self._segment_modifiers(normalized_name[len(prefix) :])

                if modifiers is not None:
                    return self._format_display_name(modifiers, self._foods[food_key])

            if normalized_name.endswith(suffix):
                modifiers = self._segment_modifiers(normalized_name[: -len(suffix)])

                if modifiers is not None:
                    return self._format_display_name(modifiers, self._foods[food_key])

        return None

    def _segment_modifiers(self, modifier_text: str) -> tuple[str, ...] | None:
        remaining = normalize_food_name_lookup_key(modifier_text)
        modifiers: list[str] = []

        while remaining != "":
            matched_modifier = None

            for modifier_key in self._modifier_keys:
                if remaining == modifier_key:
                    matched_modifier = modifier_key
                    remaining = ""
                    break

                modifier_prefix = f"{modifier_key} "

                if remaining.startswith(modifier_prefix):
                    matched_modifier = modifier_key
                    remaining = remaining[len(modifier_prefix) :].strip()
                    break

            if matched_modifier is None:
                return None

            modifiers.append(matched_modifier)

        return tuple(modifiers) if len(modifiers) > 0 else None

    def _format_display_name(
        self,
        modifier_keys: tuple[str, ...],
        food_display_name: str,
    ) -> str:
        modifier_display_names: list[str] = []

        for modifier_key in modifier_keys:
            modifier_display_name = self._modifiers[modifier_key]

            if modifier_display_name not in modifier_display_names:
                modifier_display_names.append(modifier_display_name)

        return " ".join([*modifier_display_names, food_display_name])


def normalize_food_name_lookup_key(value: str) -> str:
    normalized_value = unicodedata.normalize("NFKC", value).strip().casefold()
    normalized_value = COMMA_SPACING_PATTERN.sub(", ", normalized_value)

    return WHITESPACE_PATTERN.sub(" ", normalized_value)


def _load_korean_food_name_dictionary(path: Path) -> dict[str, object]:
    raw_dictionary = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(raw_dictionary, dict):
        raise ValueError("Korean food name localization dictionary must be an object.")

    display_locale = raw_dictionary.get("displayLocale")
    exact_phrases = raw_dictionary.get("exactPhrases")
    foods = raw_dictionary.get("foods")
    modifiers = raw_dictionary.get("modifiers")

    if not isinstance(display_locale, str) or display_locale.strip() == "":
        raise ValueError("Korean food name localization dictionary requires displayLocale.")

    return {
        "display_locale": display_locale,
        "exact_phrases": _load_string_mapping(exact_phrases, "exactPhrases"),
        "foods": _load_string_mapping(foods, "foods"),
        "modifiers": _load_string_mapping(modifiers, "modifiers"),
    }


def _load_string_mapping(value: object, field_name: str) -> dict[str, str]:
    if not isinstance(value, dict):
        raise ValueError(f"Korean food name localization dictionary requires {field_name}.")

    mapping: dict[str, str] = {}

    for raw_key, raw_display_name in value.items():
        if not isinstance(raw_key, str) or not isinstance(raw_display_name, str):
            raise ValueError(f"{field_name} entries must map strings to strings.")

        if raw_key.strip() == "" or raw_display_name.strip() == "":
            raise ValueError(f"{field_name} entries cannot be empty.")

        mapping[raw_key] = raw_display_name

    return mapping


def _normalize_dictionary(values: dict[str, str], field_name: str) -> dict[str, str]:
    normalized_values: dict[str, str] = {}

    for raw_key, display_name in values.items():
        normalized_key = normalize_food_name_lookup_key(raw_key)
        existing_display_name = normalized_values.get(normalized_key)

        if existing_display_name is not None and existing_display_name != display_name:
            raise ValueError(
                f"Ambiguous Korean food name localization entry in {field_name}: {raw_key}"
            )

        normalized_values[normalized_key] = display_name

    return normalized_values


@lru_cache
def get_food_name_localizer() -> FoodNameLocalizer:
    return KoreanFoodNameLocalizer.from_dictionary_file()
