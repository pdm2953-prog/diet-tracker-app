from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from enum import IntEnum
from typing import Iterable, Protocol, TypeVar


class _KfindRecordLike(Protocol):
    source_food_id: str | None
    source_food_name: str | None


class _KfindMetadataLike(Protocol):
    db_group_name: str | None
    db_class_name: str | None


class _KfindSearchResultLike(Protocol):
    record: _KfindRecordLike
    metadata: _KfindMetadataLike


class KfindNameMatchRank(IntEnum):
    EXACT = 0
    PREFIX_VARIANT = 1
    CONTAINS = 2
    OTHER = 3


@dataclass(frozen=True, order=True)
class KfindRankingKey:
    name_match_rank: int
    generic_food_rank: int
    representative_class_rank: int
    original_index: int


_KfindSearchResultT = TypeVar("_KfindSearchResultT", bound=_KfindSearchResultLike)
_VARIANT_SEPARATORS = frozenset({"_", "-", "(", "[", " "})
_GENERIC_FOOD_GROUP = "음식"
_REPRESENTATIVE_CLASS = "품목대표"


def rank_kfind_results(
    query: str,
    candidates: Iterable[_KfindSearchResultT],
    *,
    limit: int | None = None,
) -> list[_KfindSearchResultT]:
    deduped_candidates = dedupe_kfind_results_by_food_code(candidates)
    ranked_candidates = sorted(
        enumerate(deduped_candidates),
        key=lambda indexed_candidate: kfind_ranking_key(
            query,
            indexed_candidate[1],
            original_index=indexed_candidate[0],
        ),
    )
    results = [candidate for _index, candidate in ranked_candidates]

    if limit is None:
        return results

    return results[:max(limit, 0)]


def dedupe_kfind_results_by_food_code(
    candidates: Iterable[_KfindSearchResultT],
) -> list[_KfindSearchResultT]:
    seen_food_ids: set[str] = set()
    deduped_candidates: list[_KfindSearchResultT] = []

    for candidate in candidates:
        food_id = candidate.record.source_food_id

        if food_id is None:
            deduped_candidates.append(candidate)
            continue

        if food_id in seen_food_ids:
            continue

        seen_food_ids.add(food_id)
        deduped_candidates.append(candidate)

    return deduped_candidates


def kfind_ranking_key(
    query: str,
    candidate: _KfindSearchResultLike,
    *,
    original_index: int,
) -> KfindRankingKey:
    metadata = candidate.metadata

    return KfindRankingKey(
        name_match_rank=int(_name_match_rank(query, candidate.record.source_food_name)),
        generic_food_rank=0 if _is_generic_food(metadata) else 1,
        representative_class_rank=0 if _is_representative_class(metadata) else 1,
        original_index=original_index,
    )


def normalize_kfind_comparison_text(value: str | None) -> str:
    if value is None:
        return ""

    return unicodedata.normalize("NFKC", value).strip().casefold()


def _name_match_rank(query: str, food_name: str | None) -> KfindNameMatchRank:
    normalized_query = normalize_kfind_comparison_text(query)
    normalized_food_name = normalize_kfind_comparison_text(food_name)

    if normalized_query == "" or normalized_food_name == "":
        return KfindNameMatchRank.OTHER

    if normalized_food_name == normalized_query:
        return KfindNameMatchRank.EXACT

    if _is_prefix_variant(normalized_query, normalized_food_name):
        return KfindNameMatchRank.PREFIX_VARIANT

    if normalized_query in normalized_food_name:
        return KfindNameMatchRank.CONTAINS

    return KfindNameMatchRank.OTHER


def _is_prefix_variant(normalized_query: str, normalized_food_name: str) -> bool:
    if not normalized_food_name.startswith(normalized_query):
        return False

    suffix = normalized_food_name[len(normalized_query):]

    return suffix != "" and suffix[0] in _VARIANT_SEPARATORS


def _is_generic_food(metadata: _KfindMetadataLike) -> bool:
    return normalize_kfind_comparison_text(metadata.db_group_name) == _GENERIC_FOOD_GROUP


def _is_representative_class(metadata: _KfindMetadataLike) -> bool:
    return normalize_kfind_comparison_text(metadata.db_class_name) == _REPRESENTATIVE_CLASS
