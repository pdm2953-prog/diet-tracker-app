from __future__ import annotations

import asyncio
import importlib.util
import io
import sys
from pathlib import Path

import pytest

from app.models.food import FoodSearchRecord
from app.providers.errors import FatSecretPermissionError
from app.providers.interfaces import FoodSearchProviderResponse
from app.services.korean_food_catalog import KoreanFoodCatalog


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "inspect_fatsecret_catalog_links.py"
SPEC = importlib.util.spec_from_file_location("inspect_fatsecret_catalog_links", SCRIPT_PATH)
assert SPEC is not None and SPEC.loader is not None
script = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = script
SPEC.loader.exec_module(script)


def test_pending_exact_link_targets_include_only_missing_fatsecret_source_ids() -> None:
    catalog = KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [
            exact_item("pending-food", canonical_name="대기메뉴", source_food_id=None),
            exact_item("linked-food", canonical_name="연결메뉴", source_food_id="123"),
            provider_search_item("generic-food"),
        ],
    })

    targets = script.pending_exact_link_targets(catalog)

    assert [target.item.id for target in targets] == ["pending-food"]
    assert targets[0].ref is not None
    assert targets[0].ref.source_food_id is None


def test_resolve_inspection_targets_resolves_catalog_alias() -> None:
    catalog = KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [exact_item("kwasakking", canonical_name="콰삭킹", aliases=["콰삭킹"])],
    })

    targets = script.resolve_inspection_targets(
        catalog,
        query="콰삭킹",
        include_pending=False,
    )

    assert len(targets) == 1
    assert targets[0].item.id == "kwasakking"


def test_resolve_inspection_targets_rejects_provider_search_item() -> None:
    catalog = KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [provider_search_item("generic-food")],
    })

    with pytest.raises(script.DiagnosticError, match="external_id"):
        script.resolve_inspection_targets(
            catalog,
            query="김치찌개",
            include_pending=False,
        )


def test_resolve_diagnostic_search_terms_prefers_cli_override_without_mutating_catalog_ref() -> None:
    catalog = KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [exact_item("kwasakking", search_terms=["persisted search term"])],
    })
    target = script.resolve_inspection_targets(
        catalog,
        query="테스트메뉴",
        include_pending=False,
    )[0]

    terms = script.resolve_diagnostic_search_terms(target, "  temporary search term  ")

    assert [(term.term, term.source) for term in terms] == [
        ("temporary search term", "CLI temporary override"),
    ]
    assert target.ref is not None
    assert target.ref.search_terms == ("persisted search term",)


def test_resolve_diagnostic_search_terms_uses_catalog_terms_without_override() -> None:
    catalog = KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [exact_item("kwasakking", search_terms=["persisted one", "persisted two"])],
    })
    target = script.resolve_inspection_targets(
        catalog,
        query="테스트메뉴",
        include_pending=False,
    )[0]

    terms = script.resolve_diagnostic_search_terms(target, None)

    assert [(term.term, term.source) for term in terms] == [
        ("persisted one", "catalog persisted term"),
        ("persisted two", "catalog persisted term"),
    ]


def test_resolve_diagnostic_search_terms_returns_empty_without_override_or_catalog_terms() -> None:
    catalog = KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [exact_item("kwasakking")],
    })
    target = script.resolve_inspection_targets(
        catalog,
        query="테스트메뉴",
        include_pending=False,
    )[0]

    assert script.resolve_diagnostic_search_terms(target, None) == ()


def test_inspect_search_term_reuses_provider_search_and_detail_abstractions(
    capsys: pytest.CaptureFixture[str],
) -> None:
    provider = FakeDiagnosticProvider()

    asyncio.run(script.inspect_search_term(
        provider=provider,
        search_term="kwasakking",
        page=1,
        max_results=3,
    ))

    assert provider.search_calls == [("kwasakking", 1, 3)]
    assert provider.detail_calls == ["123"]

    output = capsys.readouterr().out
    assert "edition: basic" in output
    assert "searchMethod: foods.search" in output
    assert "detailMethod: food.get.v2" in output
    assert "food_name: Kwasakking" in output
    assert "brand_name: BHC" in output
    assert "food_id: 123" in output
    assert "food_type: Brand" in output
    assert "serving_id: serving-100" in output
    assert "metric_serving: 100 g" in output
    assert "carbs: 30" in output


def test_print_target_header_outputs_catalog_section(capsys: pytest.CaptureFixture[str]) -> None:
    catalog = KoreanFoodCatalog.from_mapping({
        "version": 1,
        "items": [exact_item("kwasakking", canonical_name="콰삭킹")],
    })
    target = script.resolve_inspection_targets(
        catalog,
        query="콰삭킹",
        include_pending=False,
    )[0]

    script.print_target_header(target)

    output = capsys.readouterr().out
    assert "Catalog:" in output
    assert "catalogId: kwasakking" in output
    assert "canonicalName: 콰삭킹" in output
    assert "brandName: 테스트브랜드" in output


def test_print_diagnostic_search_term_outputs_actual_term_and_source(
    capsys: pytest.CaptureFixture[str],
) -> None:
    search_term = script.DiagnosticSearchTerm(
        term="temporary search term",
        source="CLI temporary override",
    )

    script.print_diagnostic_search_term(search_term)

    output = capsys.readouterr().out
    assert "Diagnostic:" in output
    assert 'searchTerm: "temporary search term"' in output
    assert "searchTermSource: CLI temporary override" in output


def test_print_candidate_outputs_serving_carbs_label(capsys: pytest.CaptureFixture[str]) -> None:
    search_record = food_record(
        source_food_id="123",
        source_food_name="Candidate Food",
        brand_name="Candidate Brand",
    )
    detail = script.FatSecretFoodDetail(
        source_food_id="123",
        source_food_name="Candidate Food",
        brand_name="Candidate Brand",
        food_type="Brand",
        servings=(
            food_record(
                source_food_id="123",
                source_food_name="Candidate Food",
                brand_name="Candidate Brand",
                source_serving_id="456",
                serving_description="100 g",
                serving_size=100,
                serving_unit="g",
                calories_kcal=250,
                protein_g=20,
                carbs_g=10,
                fat_g=15,
            ),
        ),
    )

    script.print_candidate(1, search_record, detail)

    output = capsys.readouterr().out
    assert "food_name: Candidate Food" in output
    assert "serving_id: 456" in output
    assert "metric_serving: 100 g" in output
    assert "carbs: 10" in output
    assert "carbohydrate:" not in output


def test_print_fatsecret_error_outputs_safe_developer_metadata() -> None:
    error = FatSecretPermissionError(
        provider_error_code="14",
        provider_error_type="missing_scope",
        operation="search",
        api_edition="basic",
        api_method="foods.search",
    )
    stream = io.StringIO()

    script.print_fatsecret_error(error, stream=stream)

    output = stream.getvalue()
    assert "FatSecret error:" in output
    assert "mappedError: fatsecret_permission_error" in output
    assert "operation: search" in output
    assert "edition: basic" in output
    assert "method: foods.search" in output
    assert "code: 14" in output
    assert "type: missing_scope" in output
    assert "client-secret" not in output
    assert "access-token" not in output
    assert "Authorization" not in output


def test_invalid_ip_error_hides_public_ip_by_default() -> None:
    error = FatSecretPermissionError(
        provider_error_code="21",
        provider_error_type="invalid_ip",
        operation="search",
        api_edition="basic",
        api_method="foods.search",
    )
    stream = io.StringIO()

    script.print_fatsecret_error(error, stream=stream)

    output = stream.getvalue()
    assert "FatSecret error:" in output
    assert "code: 21" in output
    assert "type: invalid_ip" in output
    assert "hint: FatSecret Allowed IP 설정과 현재 public IPv4를 확인하세요." in output
    assert "Network diagnostic:" not in output
    assert "publicIPv4" not in output
    assert "8.8.8.8" not in output


def test_invalid_ip_error_can_show_network_info_when_explicitly_enabled() -> None:
    error = FatSecretPermissionError(
        provider_error_code="21",
        provider_error_type="invalid_ip",
        operation="search",
        api_edition="basic",
        api_method="foods.search",
    )
    stream = io.StringIO()

    script.print_fatsecret_error(
        error,
        stream=stream,
        show_network_info=True,
        network_info=script.NetworkDiagnostic(public_ipv4="8.8.8.8"),
    )

    output = stream.getvalue()
    assert "code: 21" in output
    assert "type: invalid_ip" in output
    assert "Network diagnostic:" in output
    assert "publicIPv4: 8.8.8.8" in output
    assert "client-secret" not in output
    assert "access-token" not in output
    assert "Authorization" not in output


def test_invalid_ip_network_info_lookup_failure_is_non_fatal() -> None:
    error = FatSecretPermissionError(
        provider_error_code="21",
        provider_error_type="invalid_ip",
    )
    stream = io.StringIO()

    script.print_fatsecret_error(
        error,
        stream=stream,
        show_network_info=True,
        network_info=script.NetworkDiagnostic(public_ipv4=None, lookup_error="lookup_failed"),
    )

    output = stream.getvalue()
    assert "Network diagnostic:" in output
    assert "publicIPv4: <unavailable>" in output
    assert "status: lookup_failed" in output


def test_fetch_network_diagnostic_parses_public_ipv4_without_real_network() -> None:
    async def fake_payload_fetcher() -> object:
        return {"ip": "8.8.8.8"}

    network_info = asyncio.run(script.fetch_network_diagnostic(fake_payload_fetcher))

    assert network_info == script.NetworkDiagnostic(public_ipv4="8.8.8.8")


def test_fetch_network_diagnostic_failure_is_best_effort() -> None:
    async def failing_payload_fetcher() -> object:
        raise RuntimeError("network unavailable")

    network_info = asyncio.run(script.fetch_network_diagnostic(failing_payload_fetcher))

    assert network_info == script.NetworkDiagnostic(
        public_ipv4=None,
        lookup_error="lookup_failed",
    )


@pytest.mark.parametrize(
    "payload",
    [
        {"ip": "127.0.0.1"},
        {"ip": "2001:4860:4860::8888"},
        {"ip": "not-an-ip"},
        {},
    ],
)
def test_public_ipv4_from_payload_rejects_non_public_ipv4(payload: object) -> None:
    assert script.public_ipv4_from_payload(payload) is None


def test_parse_args_accepts_search_term_override() -> None:
    args = script.parse_args(["콰삭킹", "--search-term", "  temporary search term  "])

    assert args.query == "콰삭킹"
    assert args.search_term == "temporary search term"
    assert args.show_network_info is False


def test_parse_args_accepts_show_network_info() -> None:
    args = script.parse_args(["콰삭킹", "--show-network-info"])

    assert args.query == "콰삭킹"
    assert args.show_network_info is True


def test_parse_args_rejects_query_and_pending_together() -> None:
    with pytest.raises(SystemExit):
        script.parse_args(["콰삭킹", "--pending"])


def test_parse_args_rejects_blank_search_term() -> None:
    with pytest.raises(SystemExit):
        script.parse_args(["콰삭킹", "--search-term", "   "])


def test_parse_args_rejects_pending_with_search_term() -> None:
    with pytest.raises(SystemExit):
        script.parse_args(["--pending", "--search-term", "temporary search term"])


class FakeDiagnosticProvider:
    api_edition = "basic"
    search_method = "foods.search"
    get_method = "food.get.v2"

    def __init__(self) -> None:
        self.search_calls: list[tuple[str, int, int]] = []
        self.detail_calls: list[str] = []

    async def search_foods(
        self,
        query: str,
        page: int,
        page_size: int,
    ) -> FoodSearchProviderResponse:
        self.search_calls.append((query, page, page_size))

        return FoodSearchProviderResponse(
            items=[
                food_record(
                    source_food_id="123",
                    source_food_name="Kwasakking",
                    brand_name="BHC",
                ),
            ],
            page=page,
            page_size=page_size,
            has_more=False,
        )

    async def get_food_detail(self, food_id: str) -> script.FatSecretFoodDetail:
        self.detail_calls.append(food_id)

        return script.FatSecretFoodDetail(
            source_food_id=food_id,
            source_food_name="Kwasakking",
            brand_name="BHC",
            food_type="Brand",
            servings=(
                food_record(
                    source_food_id=food_id,
                    source_food_name="Kwasakking",
                    brand_name="BHC",
                    source_serving_id="serving-100",
                    serving_description="100 g",
                    serving_size=100,
                    serving_unit="g",
                    calories_kcal=300,
                    protein_g=20,
                    carbs_g=30,
                    fat_g=10,
                ),
            ),
        )


def food_record(
    *,
    source_food_id: str,
    source_food_name: str,
    brand_name: str | None,
    source_serving_id: str | None = None,
    serving_description: str | None = None,
    serving_size: float | None = None,
    serving_unit: str | None = None,
    calories_kcal: float | None = None,
    protein_g: float | None = None,
    carbs_g: float | None = None,
    fat_g: float | None = None,
) -> FoodSearchRecord:
    return FoodSearchRecord(
        id=f"fatsecret-{source_food_id}-{source_serving_id or 'default'}",
        data_source="fatsecret",
        source_food_id=source_food_id,
        source_food_name=source_food_name,
        source_serving_id=source_serving_id,
        name=source_food_name,
        brand_name=brand_name,
        serving_description=serving_description,
        serving_size=serving_size,
        serving_unit=serving_unit,
        calories_kcal=calories_kcal,
        protein_g=protein_g,
        carbs_g=carbs_g,
        fat_g=fat_g,
        source_region="US",
    )


def exact_item(
    catalog_id: str,
    *,
    canonical_name: str = "테스트메뉴",
    aliases: list[str] | None = None,
    source_food_id: str | None = None,
    search_terms: list[str] | None = None,
) -> dict[str, object]:
    return {
        "id": catalog_id,
        "canonicalName": canonical_name,
        "brandName": "테스트브랜드",
        "category": "테스트",
        "aliases": aliases or [canonical_name],
        "matchStrategy": "external_id",
        "externalRefs": [
            {
                "provider": "fatsecret",
                "sourceFoodId": source_food_id,
                "sourceServingId": None,
                "searchTerms": [] if search_terms is None else search_terms,
            }
        ],
    }


def provider_search_item(catalog_id: str) -> dict[str, object]:
    return {
        "id": catalog_id,
        "canonicalName": "김치찌개",
        "brandName": None,
        "category": "찌개",
        "aliases": ["김치찌개"],
        "matchStrategy": "provider_search",
        "externalRefs": [
            {
                "provider": "fatsecret",
                "sourceFoodId": None,
                "sourceServingId": None,
                "searchTerms": ["kimchi stew"],
            }
        ],
    }