from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path
from typing import TextIO


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings
from app.providers.errors import FoodProviderError, KfindConfigurationError
from app.providers.kfind import (
    KFIND_CATEGORY_AUTH,
    KFIND_CATEGORY_MALFORMED_RESPONSE,
    KFIND_CATEGORY_PERMISSION,
    KFIND_CATEGORY_RATE_LIMIT,
    KFIND_CATEGORY_TIMEOUT,
    KFIND_CATEGORY_UNAVAILABLE,
    KfindFoodProvider,
    KfindFoodSearchResponse,
    KfindProviderConfig,
    kfind_error_metadata,
)


DEFAULT_MAX_RESULTS = 10
MAX_DIAGNOSTIC_RESULTS = 10
AUTH_CHECK_REQUIRED_HINT = "공공데이터포털에서 활용기간과 인증키 상태를 확인하세요."
AUTH_DIAGNOSTIC_HINT = (
    "K-FIND 인증키가 만료·비활성 상태이거나 서비스에 등록되지 않았을 수 있습니다. "
    "공공데이터포털에서 식품영양성분DB정보의 활용기간과 인증키 상태를 확인하세요."
)


class DiagnosticError(RuntimeError):
    pass


async def run(args: argparse.Namespace) -> int:
    if args.check_auth:
        return await run_check_auth()

    if args.query is None or args.query.strip() == "":
        raise DiagnosticError("검색어를 입력하거나 --check-auth를 사용하세요.")

    max_results = normalize_max_results(args.max_results)
    config = load_kfind_config()
    provider = KfindFoodProvider(config)

    try:
        response = await provider.search_foods(
            args.query,
            page=args.page,
            page_size=max_results,
        )
    finally:
        await provider.aclose()

    print_response(args.query, response, stream=sys.stdout)

    return 0


async def run_check_auth() -> int:
    config = load_kfind_config()
    provider = KfindFoodProvider(config)

    try:
        await provider.check_auth()
    except FoodProviderError as exc:
        print_auth_check_error(exc, stream=sys.stdout)
        return 1
    finally:
        await provider.aclose()

    print("K-FIND auth: OK")

    return 0


def load_kfind_config() -> KfindProviderConfig:
    settings = Settings(_env_file=BACKEND_ROOT / ".env")

    return KfindProviderConfig.from_settings(settings)


def normalize_max_results(value: int | None) -> int:
    max_results = value or DEFAULT_MAX_RESULTS

    return min(max(max_results, 1), MAX_DIAGNOSTIC_RESULTS)


def print_response(
    query: str,
    response: KfindFoodSearchResponse,
    *,
    stream: TextIO,
) -> None:
    print(f"query: {query}", file=stream)
    print(f"totalCount: {format_value(response.total_count)}", file=stream)
    print("candidates:", file=stream)

    if len(response.candidates) == 0:
        print("  (none)", file=stream)
        return

    for index, candidate in enumerate(response.candidates[:MAX_DIAGNOSTIC_RESULTS], start=1):
        record = candidate.record
        metadata = candidate.metadata
        print(f"{index}. FOOD_CD: {format_value(record.source_food_id)}", file=stream)
        print(f"   FOOD_NM_KR: {format_value(record.source_food_name)}", file=stream)
        print(f"   DB_GRP_NM: {format_value(metadata.db_group_name)}", file=stream)
        print(f"   DB_CLASS_NM: {format_value(metadata.db_class_name)}", file=stream)
        print(f"   SERVING_SIZE: {format_value(metadata.serving_size_raw)}", file=stream)
        print(
            "   calories/protein/carbs/fat: "
            f"{format_value(record.calories_kcal)} / "
            f"{format_value(record.protein_g)} / "
            f"{format_value(record.carbs_g)} / "
            f"{format_value(record.fat_g)}",
            file=stream,
        )
        print(f"   source: {format_value(metadata.source_name)}", file=stream)
        print(f"   maker: {format_value(metadata.display_maker_name)}", file=stream)
        print(f"   food weight: {format_value(metadata.food_weight)}", file=stream)
        print(f"   update date: {format_value(metadata.update_date)}", file=stream)


def print_auth_check_error(error: FoodProviderError, *, stream: TextIO) -> None:
    metadata = kfind_error_metadata(error)

    if metadata.category == KFIND_CATEGORY_AUTH:
        print("K-FIND auth: CHECK_REQUIRED", file=stream)
        print(f"hint: {AUTH_CHECK_REQUIRED_HINT}", file=stream)
        return

    if metadata.category == KFIND_CATEGORY_TIMEOUT:
        print("K-FIND status: TIMEOUT", file=stream)
        return

    if metadata.category == KFIND_CATEGORY_UNAVAILABLE:
        print("K-FIND status: UNAVAILABLE", file=stream)
        return

    if metadata.category == KFIND_CATEGORY_RATE_LIMIT:
        print("K-FIND status: RATE_LIMITED", file=stream)
        return

    if metadata.category == KFIND_CATEGORY_PERMISSION:
        print("K-FIND status: PERMISSION_DENIED", file=stream)
        return

    if metadata.category == KFIND_CATEGORY_MALFORMED_RESPONSE:
        print("K-FIND status: MALFORMED_RESPONSE", file=stream)
        return

    print("K-FIND status: UNAVAILABLE", file=stream)


def format_value(value: object) -> str:
    if value is None:
        return "-"

    if isinstance(value, float):
        return f"{value:g}"

    normalized_value = str(value).strip()

    return normalized_value if normalized_value != "" else "-"


def print_provider_error(error: FoodProviderError, *, stream: TextIO) -> None:
    metadata = kfind_error_metadata(error)

    print("K-FIND error:", file=stream)
    print(f"  provider: {metadata.provider}", file=stream)
    print(f"  category: {metadata.category}", file=stream)
    print(f"  code: {error.error_code}", file=stream)
    print(f"  message: {error.public_message}", file=stream)

    if metadata.upstream_code is not None:
        print(f"  upstreamCode: {metadata.upstream_code}", file=stream)

    if metadata.operation is not None:
        print(f"  operation: {metadata.operation}", file=stream)

    if metadata.category == KFIND_CATEGORY_AUTH:
        print(f"hint: {AUTH_DIAGNOSTIC_HINT}", file=stream)


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Read-only diagnostic for K-FIND/MFDS food nutrition search.",
    )
    parser.add_argument("query", nargs="?", help="Korean food name to search, for example 된장찌개.")
    parser.add_argument(
        "--check-auth",
        action="store_true",
        help="Run a minimal read-only K-FIND auth/status check.",
    )
    parser.add_argument(
        "--page",
        type=int,
        default=1,
        help="K-FIND page number. Default: 1.",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=DEFAULT_MAX_RESULTS,
        help="Maximum candidates to print. Capped at 10. Default: 10.",
    )

    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)

    try:
        return asyncio.run(run(args))
    except KfindConfigurationError as exc:
        print_provider_error(exc, stream=sys.stderr)
        return 2
    except FoodProviderError as exc:
        print_provider_error(exc, stream=sys.stderr)
        return 1
    except DiagnosticError as exc:
        print(f"diagnostic error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())