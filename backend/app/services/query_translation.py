from __future__ import annotations

import json
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal, Protocol


FoodSearchQueryTranslationStatus = Literal["identity", "translated", "unresolved"]
DEFAULT_KOREAN_FOOD_ALIAS_PATH = (
    Path(__file__).resolve().parent.parent / "data" / "korean_food_aliases.json"
)
HANGUL_PATTERN = re.compile(r"[가-힣ㄱ-ㅎㅏ-ㅣ]")
WHITESPACE_PATTERN = re.compile(r"\s+")


@dataclass(frozen=True)
class FoodSearchQueryTranslation:
    original: str
    resolved: str
    was_translated: bool
    translator_name: str
    status: FoodSearchQueryTranslationStatus
    source_language: str
    target_language: str

    @property
    def should_include_response_metadata(self) -> bool:
        return self.status != "identity"


class FoodSearchQueryTranslator(Protocol):
    @property
    def translator_name(self) -> str:
        raise NotImplementedError

    def translate(
        self,
        query: str,
        source_language: str,
        target_language: str,
    ) -> FoodSearchQueryTranslation:
        raise NotImplementedError


class IdentityQueryTranslator:
    @property
    def translator_name(self) -> str:
        return "identity"

    def translate(
        self,
        query: str,
        source_language: str,
        target_language: str,
    ) -> FoodSearchQueryTranslation:
        normalized_query = normalize_query_spacing(query)

        return FoodSearchQueryTranslation(
            original=normalized_query,
            resolved=normalized_query,
            was_translated=False,
            translator_name=self.translator_name,
            status="identity",
            source_language=source_language,
            target_language=target_language,
        )


@dataclass(frozen=True)
class KoreanFoodAlias:
    aliases: tuple[str, ...]
    resolved: str


class KoreanFoodAliasTranslator:
    def __init__(self, aliases: tuple[KoreanFoodAlias, ...]) -> None:
        self._aliases_by_key = _build_alias_lookup(aliases)

    @property
    def translator_name(self) -> str:
        return "korean_food_alias"

    @classmethod
    def from_alias_file(cls, path: Path = DEFAULT_KOREAN_FOOD_ALIAS_PATH) -> "KoreanFoodAliasTranslator":
        return cls(_load_aliases(path))

    def translate(
        self,
        query: str,
        source_language: str,
        target_language: str,
    ) -> FoodSearchQueryTranslation:
        normalized_query = normalize_query_spacing(query)

        if not contains_hangul(normalized_query):
            return FoodSearchQueryTranslation(
                original=normalized_query,
                resolved=normalized_query,
                was_translated=False,
                translator_name=self.translator_name,
                status="identity",
                source_language=source_language,
                target_language=target_language,
            )

        if source_language.casefold() != "ko" or target_language.casefold() != "en":
            return FoodSearchQueryTranslation(
                original=normalized_query,
                resolved=normalized_query,
                was_translated=False,
                translator_name=self.translator_name,
                status="unresolved",
                source_language=source_language,
                target_language=target_language,
            )

        resolved_query = self._aliases_by_key.get(_alias_lookup_key(normalized_query))

        if resolved_query is None:
            resolved_query = self._aliases_by_key.get(_compact_alias_lookup_key(normalized_query))

        if resolved_query is None:
            return FoodSearchQueryTranslation(
                original=normalized_query,
                resolved=normalized_query,
                was_translated=False,
                translator_name=self.translator_name,
                status="unresolved",
                source_language=source_language,
                target_language=target_language,
            )

        return FoodSearchQueryTranslation(
            original=normalized_query,
            resolved=resolved_query,
            was_translated=True,
            translator_name=self.translator_name,
            status="translated",
            source_language=source_language,
            target_language=target_language,
        )


def contains_hangul(value: str) -> bool:
    return HANGUL_PATTERN.search(value) is not None


def normalize_query_spacing(value: str) -> str:
    normalized_value = unicodedata.normalize("NFKC", value).strip()

    return WHITESPACE_PATTERN.sub(" ", normalized_value)


def _load_aliases(path: Path) -> tuple[KoreanFoodAlias, ...]:
    raw_aliases = json.loads(path.read_text(encoding="utf-8"))

    if not isinstance(raw_aliases, list):
        raise ValueError("Korean food aliases must be a list.")

    aliases: list[KoreanFoodAlias] = []

    for raw_alias in raw_aliases:
        if not isinstance(raw_alias, dict):
            raise ValueError("Each Korean food alias entry must be an object.")

        raw_alias_values = raw_alias.get("aliases")
        raw_resolved = raw_alias.get("resolved")

        if not isinstance(raw_alias_values, list) or not isinstance(raw_resolved, str):
            raise ValueError("Each Korean food alias entry requires aliases and resolved.")

        alias_values = tuple(
            normalize_query_spacing(alias)
            for alias in raw_alias_values
            if isinstance(alias, str) and normalize_query_spacing(alias) != ""
        )
        resolved = normalize_query_spacing(raw_resolved)

        if len(alias_values) == 0 or resolved == "":
            raise ValueError("Korean food alias entries cannot be empty.")

        aliases.append(KoreanFoodAlias(aliases=alias_values, resolved=resolved))

    return tuple(aliases)


def _build_alias_lookup(aliases: tuple[KoreanFoodAlias, ...]) -> dict[str, str]:
    aliases_by_key: dict[str, str] = {}

    for alias_entry in aliases:
        for alias in alias_entry.aliases:
            for key in {_alias_lookup_key(alias), _compact_alias_lookup_key(alias)}:
                existing_resolved = aliases_by_key.get(key)

                if existing_resolved is not None and existing_resolved != alias_entry.resolved:
                    raise ValueError(f"Ambiguous Korean food alias: {alias}")

                aliases_by_key[key] = alias_entry.resolved

    return aliases_by_key


def _alias_lookup_key(value: str) -> str:
    return normalize_query_spacing(value).casefold()


def _compact_alias_lookup_key(value: str) -> str:
    return _alias_lookup_key(value).replace(" ", "")
