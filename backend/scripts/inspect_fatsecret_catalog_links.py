from __future__ import annotations

import argparse
import asyncio
import ipaddress
import sys
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from pathlib import Path
from typing import TextIO

import httpx


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import Settings
from app.models.food import FoodSearchRecord
from app.providers.errors import FoodProviderError
from app.providers.fatsecret import (
    FatSecretFoodDetail,
    FatSecretFoodProvider,
    FatSecretProviderConfig,
)
from app.services.korean_food_catalog import (
    ExternalFoodRef,
    KoreanFoodCatalog,
    KoreanFoodCatalogItem,
)


DEFAULT_PAGE = 1
DEFAULT_MAX_RESULTS = 10
FATSECRET_PROVIDER_NAME = "fatsecret"
PUBLIC_IPV4_ENDPOINT = "https://api.ipify.org?format=json"
PUBLIC_IPV4_TIMEOUT_SECONDS = 3.0
INVALID_IP_HINT = "FatSecret Allowed IP 설정과 현재 public IPv4를 확인하세요."


class DiagnosticError(RuntimeError):
    pass


@dataclass(frozen=True)
class InspectionTarget:
    item: KoreanFoodCatalogItem
    ref: ExternalFoodRef | None


@dataclass(frozen=True)
class DiagnosticSearchTerm:
    term: str
    source: str


@dataclass(frozen=True)
class NetworkDiagnostic:
    public_ipv4: str | None
    lookup_error: str | None = None


async def run(args: argparse.Namespace) -> int:
    catalog = KoreanFoodCatalog.from_catalog_file()
    targets = resolve_inspection_targets(
        catalog,
        query=args.query,
        include_pending=args.pending,
    )

    if len(targets) == 0:
        print("검사할 external_id FatSecret pending 항목이 없습니다.")
        return 0

    needs_fatsecret = any(
        len(resolve_diagnostic_search_terms(target, args.search_term)) > 0
        for target in targets
    )
    config: FatSecretProviderConfig | None = None
    provider: FatSecretFoodProvider | None = None
    max_results = DEFAULT_MAX_RESULTS

    if needs_fatsecret:
        config = load_basic_fatsecret_config()
        max_results = normalize_max_results(args.max_results, config.basic_max_results)
        provider = FatSecretFoodProvider(config)

    try:
        for target_index, target in enumerate(targets):
            if target_index > 0:
                print()

            print_target_header(target)

            diagnostic_search_terms = resolve_diagnostic_search_terms(target, args.search_term)
            if len(diagnostic_search_terms) == 0:
                print()
                print_diagnostic_search_term(None)
                print("searchTerms 검증 필요: 자동 영어 번역이나 임의 검색어 생성은 하지 않았습니다.")
                continue

            if provider is None:
                raise DiagnosticError("FatSecret provider initialization failed.")

            for diagnostic_search_term in diagnostic_search_terms:
                print()
                print_diagnostic_search_term(diagnostic_search_term)
                await inspect_search_term(
                    provider=provider,
                    search_term=diagnostic_search_term.term,
                    page=args.page,
                    max_results=max_results,
                )
    finally:
        if provider is not None:
            await provider.aclose()

    return 0


def load_basic_fatsecret_config() -> FatSecretProviderConfig:
    settings = Settings(_env_file=BACKEND_ROOT / ".env")
    config = FatSecretProviderConfig.from_settings(settings)

    if config.api_edition != "basic":
        raise DiagnosticError(
            "이 diagnostic script는 FatSecret Basic API만 사용합니다. "
            "backend/.env의 FATSECRET_API_EDITION을 basic으로 설정한 별도 환경에서 실행하세요."
        )

    return config


def normalize_max_results(requested_max_results: int | None, configured_max_results: int) -> int:
    max_results = requested_max_results or configured_max_results or DEFAULT_MAX_RESULTS

    return min(max(max_results, 1), configured_max_results)


def resolve_inspection_targets(
    catalog: KoreanFoodCatalog,
    *,
    query: str | None,
    include_pending: bool,
) -> list[InspectionTarget]:
    if include_pending:
        return pending_exact_link_targets(catalog)

    if query is None or query.strip() == "":
        raise DiagnosticError('검색할 catalog alias/canonical name을 입력하거나 --pending을 사용하세요.')

    item = catalog.resolve(query)

    if item is None:
        raise DiagnosticError(f"KoreanFoodCatalog에서 항목을 찾지 못했습니다: {query}")

    if item.match_strategy != "external_id":
        raise DiagnosticError(
            f"external_id 항목만 검사할 수 있습니다: {item.id} ({item.match_strategy})"
        )

    return [InspectionTarget(item=item, ref=first_fatsecret_ref(item))]


def pending_exact_link_targets(catalog: KoreanFoodCatalog) -> list[InspectionTarget]:
    targets: list[InspectionTarget] = []

    for item in catalog.items:
        if item.match_strategy != "external_id":
            continue

        ref = first_fatsecret_ref(item)

        if ref is None or ref.source_food_id is None:
            targets.append(InspectionTarget(item=item, ref=ref))

    return targets


def first_fatsecret_ref(item: KoreanFoodCatalogItem) -> ExternalFoodRef | None:
    for ref in item.refs_for_provider(FATSECRET_PROVIDER_NAME):
        return ref

    return None


def resolve_diagnostic_search_terms(
    target: InspectionTarget,
    override_search_term: str | None,
) -> tuple[DiagnosticSearchTerm, ...]:
    normalized_override = as_non_empty_string(override_search_term)

    if normalized_override is not None:
        return (
            DiagnosticSearchTerm(
                term=normalized_override,
                source="CLI temporary override",
            ),
        )

    if target.ref is None:
        return ()

    return tuple(
        DiagnosticSearchTerm(
            term=search_term,
            source="catalog persisted term",
        )
        for search_term in target.ref.search_terms
    )


async def inspect_search_term(
    *,
    provider: FatSecretFoodProvider,
    search_term: str,
    page: int,
    max_results: int,
) -> None:
    print("FatSecret request:")
    print(f"  edition: {provider.api_edition}")
    print(f"  searchMethod: {provider.search_method}")
    print(f"  detailMethod: {provider.get_method}")
    print(f"  page: {page}")
    print(f"  max_results: {max_results}")
    print("FatSecret candidates:")

    provider_response = await provider.search_foods(search_term, page, max_results)
    print(f"  has_more: {str(provider_response.has_more).lower()}")

    if len(provider_response.items) == 0:
        print("  후보 없음")
        return

    for index, search_record in enumerate(provider_response.items, start=1):
        detail = await fetch_provider_detail(provider, search_record)

        print()
        print_candidate(index, search_record, detail)


async def fetch_provider_detail(
    provider: FatSecretFoodProvider,
    search_record: FoodSearchRecord,
) -> FatSecretFoodDetail | None:
    food_id = as_non_empty_string(search_record.source_food_id)

    if food_id is None:
        return None

    return await provider.get_food_detail(food_id)


def print_target_header(target: InspectionTarget) -> None:
    item = target.item
    ref = target.ref

    print(f"== {item.id} ==")
    print("Catalog:")
    print(f"  catalogId: {item.id}")
    print(f"  canonicalName: {item.canonical_name}")
    print(f"  brandName: {format_value(item.brand_name)}")
    print(f"  category: {item.category}")
    print(f"  matchStrategy: {item.match_strategy}")

    if ref is None:
        print("  fatsecret externalRef: <missing>")
        return

    print("  fatsecret externalRef:")
    print(f"    sourceFoodId: {format_value(ref.source_food_id)}")
    print(f"    sourceServingId: {format_value(ref.source_serving_id)}")
    print(f"    searchTerms: {format_search_terms(ref.search_terms)}")


def print_diagnostic_search_term(search_term: DiagnosticSearchTerm | None) -> None:
    print("Diagnostic:")

    if search_term is None:
        print("  searchTerm: <unset>")
        print("  searchTermSource: <unset>")
        return

    print(f'  searchTerm: "{search_term.term}"')
    print(f"  searchTermSource: {search_term.source}")


def print_candidate(
    index: int,
    search_record: FoodSearchRecord,
    detail: FatSecretFoodDetail | None,
) -> None:
    print(f"후보 {index}")
    print(f"  food_name: {format_value(food_name_for_candidate(search_record, detail))}")
    print(f"  brand_name: {format_value(brand_name_for_candidate(search_record, detail))}")
    print(f"  food_id: {format_value(food_id_for_candidate(search_record, detail))}")
    print(f"  food_type: {format_value(detail.food_type if detail is not None else None)}")

    servings = detail.servings if detail is not None else (search_record,)

    if len(servings) == 0:
        print("  servings: <none>")
        return

    print("  servings:")
    for serving_index, serving in enumerate(servings, start=1):
        print(f"    [{serving_index}]")
        print(f"      serving_description: {format_value(serving.serving_description)}")
        print(f"      serving_id: {format_value(serving.source_serving_id)}")
        print(f"      metric_serving: {format_metric_serving(serving)}")
        print(f"      calories: {format_value(serving.calories_kcal)}")
        print(f"      protein: {format_value(serving.protein_g)}")
        print(f"      carbs: {format_value(serving.carbs_g)}")
        print(f"      fat: {format_value(serving.fat_g)}")


def food_name_for_candidate(
    search_record: FoodSearchRecord,
    detail: FatSecretFoodDetail | None,
) -> str | None:
    if detail is not None:
        return detail.source_food_name

    return search_record.source_food_name or search_record.name


def brand_name_for_candidate(
    search_record: FoodSearchRecord,
    detail: FatSecretFoodDetail | None,
) -> str | None:
    if detail is not None:
        return detail.brand_name

    return search_record.brand_name


def food_id_for_candidate(
    search_record: FoodSearchRecord,
    detail: FatSecretFoodDetail | None,
) -> str | None:
    if detail is not None:
        return detail.source_food_id

    return search_record.source_food_id


def print_fatsecret_error(
    error: FoodProviderError,
    *,
    stream: TextIO = sys.stderr,
    show_network_info: bool = False,
    network_info: NetworkDiagnostic | None = None,
) -> None:
    if is_invalid_ip_error(error):
        print("FatSecret error:", file=stream)
        print(f"  code: {format_value(error.provider_error_code)}", file=stream)
        print(f"  type: {format_value(error.provider_error_type)}", file=stream)
        print(f"  hint: {INVALID_IP_HINT}", file=stream)

        if show_network_info:
            print_network_diagnostic(network_info, stream=stream)

        return

    print("FatSecret error:", file=stream)
    print(f"  mappedError: {error.error_code}", file=stream)
    print(f"  operation: {format_value(error.operation)}", file=stream)
    print(f"  edition: {format_value(error.api_edition)}", file=stream)
    print(f"  method: {format_value(error.api_method)}", file=stream)
    print(f"  code: {format_value(error.provider_error_code)}", file=stream)
    print(f"  type: {format_value(error.provider_error_type)}", file=stream)


def is_invalid_ip_error(error: FoodProviderError) -> bool:
    return error.provider_error_code == "21" or error.provider_error_type == "invalid_ip"


def print_network_diagnostic(
    network_info: NetworkDiagnostic | None,
    *,
    stream: TextIO = sys.stderr,
) -> None:
    print("Network diagnostic:", file=stream)

    if network_info is not None and network_info.public_ipv4 is not None:
        print(f"  publicIPv4: {network_info.public_ipv4}", file=stream)
        return

    print("  publicIPv4: <unavailable>", file=stream)

    if network_info is not None and network_info.lookup_error is not None:
        print(f"  status: {network_info.lookup_error}", file=stream)


async def fetch_network_diagnostic(
    payload_fetcher: Callable[[], Awaitable[object]] | None = None,
) -> NetworkDiagnostic:
    try:
        payload = await (payload_fetcher or fetch_public_ipv4_payload)()
        public_ipv4 = public_ipv4_from_payload(payload)

        if public_ipv4 is None:
            return NetworkDiagnostic(public_ipv4=None, lookup_error="invalid_response")

        return NetworkDiagnostic(public_ipv4=public_ipv4)
    except Exception:
        return NetworkDiagnostic(public_ipv4=None, lookup_error="lookup_failed")


async def fetch_public_ipv4_payload() -> object:
    async with httpx.AsyncClient(timeout=PUBLIC_IPV4_TIMEOUT_SECONDS) as client:
        response = await client.get(
            PUBLIC_IPV4_ENDPOINT,
            headers={"Accept": "application/json"},
        )
        response.raise_for_status()
        return response.json()


def public_ipv4_from_payload(payload: object) -> str | None:
    if isinstance(payload, dict):
        candidate = payload.get("ip")
    else:
        candidate = payload

    normalized_candidate = as_non_empty_string(candidate)

    if normalized_candidate is None:
        return None

    try:
        ip_address = ipaddress.ip_address(normalized_candidate)
    except ValueError:
        return None

    if ip_address.version != 4 or not ip_address.is_global:
        return None

    return str(ip_address)


def as_non_empty_string(value: object | None) -> str | None:
    if value is None:
        return None

    normalized_value = str(value).strip()

    return normalized_value or None


def format_metric_serving(serving: FoodSearchRecord) -> str:
    amount = serving.serving_size
    unit = as_non_empty_string(serving.serving_unit)

    if amount is None and unit is None:
        return "<none>"

    if amount is None:
        return unit or "<none>"

    if unit is None:
        return format_number(amount)

    return f"{format_number(amount)} {unit}"


def format_search_terms(search_terms: tuple[str, ...]) -> str:
    if len(search_terms) == 0:
        return "<empty>"

    return ", ".join(f'"{term}"' for term in search_terms)


def format_value(value: object | None) -> str:
    if value is None:
        return "<unset>"

    normalized_value = str(value).strip()

    return normalized_value or "<unset>"


def format_number(value: float) -> str:
    return str(int(value)) if value.is_integer() else f"{value:g}"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Read-only diagnostic for manually verifying KoreanFoodCatalog "
            "FatSecret exact-link candidates."
        )
    )
    parser.add_argument(
        "query",
        nargs="?",
        help="Catalog alias or canonical name, for example: 콰삭킹",
    )
    parser.add_argument(
        "--pending",
        action="store_true",
        help="Inspect external_id catalog items whose FatSecret sourceFoodId is still null.",
    )
    parser.add_argument(
        "--page",
        type=int,
        default=DEFAULT_PAGE,
        help="FatSecret search page to inspect. Frontend-style 1-based page. Default: 1.",
    )
    parser.add_argument(
        "--max-results",
        type=int,
        default=None,
        help="FatSecret max_results for each search term. Capped by FATSECRET_BASIC_MAX_RESULTS.",
    )
    parser.add_argument(
        "--search-term",
        default=None,
        help=(
            "Temporary read-only FatSecret search_expression override for this run only. "
            "This never updates korean_food_catalog.json."
        ),
    )
    parser.add_argument(
        "--show-network-info",
        action="store_true",
        help=(
            "On FatSecret invalid_ip errors, best-effort lookup and print this machine's "
            "current public IPv4 for local troubleshooting only."
        ),
    )
    args = parser.parse_args(argv)

    if args.pending and args.query is not None:
        parser.error("query와 --pending은 동시에 사용할 수 없습니다.")

    if not args.pending and args.query is None:
        parser.error("query 또는 --pending이 필요합니다.")

    if args.page < 1:
        parser.error("--page는 1 이상이어야 합니다.")

    if args.max_results is not None and args.max_results < 1:
        parser.error("--max-results는 1 이상이어야 합니다.")

    if args.search_term is not None:
        args.search_term = args.search_term.strip()

        if args.search_term == "":
            parser.error("--search-term은 비어 있을 수 없습니다.")

    if args.pending and args.search_term is not None:
        parser.error("--search-term은 단일 query diagnostic 실행에서만 사용할 수 있습니다.")

    return args


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)

    try:
        return asyncio.run(run(args))
    except FoodProviderError as exc:
        network_info = None

        if args.show_network_info and is_invalid_ip_error(exc):
            network_info = asyncio.run(fetch_network_diagnostic())

        print_fatsecret_error(
            exc,
            show_network_info=args.show_network_info,
            network_info=network_info,
        )
        return 2
    except DiagnosticError as exc:
        print(f"Diagnostic 오류: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())