# Korean Food Catalog

`KoreanFoodCatalog`의 기본 책임은 한국 음식 identity와 provider-neutral link를 관리하는 것이다. FatSecret 응답을 장기 저장하거나 영양 payload를 복제하는 DB가 아니다.

예외적으로 `curated_nutrition` 전략은 FatSecret Premier KR 같은 provider 경로까지 검토한 뒤에도 정확한 브랜드 메뉴를 식별할 수 없고, 식약처/브랜드/제조사처럼 독립적으로 사용 가능한 출처에서 영양정보를 확인한 경우에만 catalog nutrition을 가진다. 이 값은 FatSecret payload 복사본이 아니어야 한다.

Frontend는 계속 `GET /api/v1/foods/search`만 호출한다. FatSecret, Basic/Premier, 영문 검색어, `sourceFoodId`, `sourceServingId`, catalog routing, 향후 자체 DB provider 우선순위는 backend 내부 구현이다.

## 책임 분리

Catalog가 관리하는 것:

- 한국 음식의 stable id
- canonical Korean name
- brand name
- category
- aliases
- 외부 provider 참조
- provider 검색어 metadata
- `curated_nutrition`일 때만 독립 검증 출처가 있는 최소 영양값과 source metadata

Catalog가 관리하지 않는 것:

- FatSecret response snapshot
- FatSecret nutrition payload 복제
- 장기 cache 목적의 provider 응답 저장
- 출처 없는 추정 영양값
- 테스트용 임의 FatSecret production data

일반 영양정보 payload는 `FoodProvider`가 반환한다. 현재 provider는 FatSecret이고, 향후 `DatabaseFoodProvider`가 추가되어도 frontend contract는 그대로 유지한다.

## Match Strategy

### `external_id`

검증된 외부 provider food id가 있는 브랜드 고유 메뉴에 사용한다. Schema v1에서는 routing 검증 대기 중인 브랜드 메뉴도 `sourceFoodId: null`, `sourceServingId: null`, `searchTerms: []`인 pending exact-link candidate로 표현한다. 이 상태는 `VERIFIED_EXTERNAL_ID`가 아니다.

예: BHC 뿌링클, BHC 콰삭킹, 교촌 허니콤보, 굽네 고추바사삭.

검증된 `sourceFoodId`가 있으면 `foods.search`를 거치지 않고 provider direct lookup을 먼저 사용한다. FatSecret에서는 `food.get` 흐름이다. `sourceServingId`가 있으면 provider가 해당 serving을 우선 선택한다.

`sourceFoodId`와 `sourceServingId`는 실제 FatSecret 결과를 사람이 확인한 뒤에만 등록한다. 검색 결과 첫 번째 항목이나 fuzzy score만으로 자동 확정하지 않는다. `sourceFoodId`가 없는 `external_id` 항목은 provider search로 fallback하지 않고 빈 결과를 반환해 잘못된 외부 후보를 자동 선택하지 않는다.

### `provider_search`

김치찌개 같은 일반 한국 음식에 사용한다.

예: 김치찌개, 된장찌개, 비빔밥, 불고기.

하나의 외부 `food_id`에 고정하지 않고 검증된 provider별 search term으로 후보를 검색한다. Search term은 provider routing metadata이며 frontend에 노출하지 않는다. 검증 전 일반 음식 seed는 provider ref를 유지하되 `searchTerms: []` pending 상태로 둘 수 있으며, 이 경우 backend는 provider에 임의 query를 보내지 않고 빈 결과를 반환한다. FatSecret Basic US/en 후보에서 해당 한국 음식과 의미적으로 동일한 음식 identity가 확인되어야 verified로 본다. 단순 ingredient match, 특정 레시피/가공식품만 나오는 결과, query token 일부만 맞는 unrelated result는 verified로 등록하지 않는다.

### `curated_nutrition`

FatSecret Basic 등 외부 provider에서 정확한 브랜드 메뉴를 식별할 수 없지만, 공식/검증 가능한 출처에서 직접 확보한 영양정보가 있는 한국 브랜드 메뉴에 사용한다.

허용 출처:

- `mfds`: 식약처 등 공공/공식 식품영양 데이터
- `brand_official`: 브랜드 공식 영양정보 페이지 또는 문서
- `manufacturer`: 제조사 제공 영양정보
- `other`: 위 분류에 들어가지 않지만 검토 가능한 독립 출처

`verificationStatus`가 `official` 또는 `reviewed`이고 nutrition/source metadata가 모두 유효할 때만 API 결과로 반환한다. `estimated` 또는 `needs_verification`은 catalog에 보존할 수 있지만 검색 결과 nutrition으로 사용하지 않는다.

Nutrition 값은 다음 필드를 가진다.

```json
{
  "nutrition": {
    "servingSize": 100,
    "servingUnit": "g",
    "caloriesKcal": null,
    "proteinG": 20,
    "carbsG": 0,
    "fatG": null
  },
  "nutritionSource": {
    "type": "brand_official",
    "name": "브랜드 공식 영양정보",
    "url": "https://example.test/nutrition",
    "recordId": "menu-record-id",
    "checkedAt": "2026-08-09"
  },
  "verificationStatus": "reviewed"
}
```

확인되지 않은 값은 `0`이 아니라 `null`로 둔다. 실제 0인 값과 정보 없음은 반드시 구분한다.

## Resolution 순서

`FoodSearchService`는 다음 순서로 처리한다.

1. `KoreanFoodCatalog` exact alias/canonical/brand+food resolve
2. `curated_nutrition`이고 usable verified nutrition이면 catalog nutrition 반환
3. `external_id`이고 검증된 `sourceFoodId`가 있으면 provider direct lookup
4. `provider_search`이고 검증된 `searchTerms`가 있으면 provider search
5. catalog hit이지만 nutrition/link가 검증되지 않았으면 빈 결과 반환
6. catalog miss이면 `KoreanFoodAliasTranslator` generic alias 적용
7. 영어 query는 기존 provider search 유지

`KoreanFoodAliasTranslator`는 `닭가슴살 -> chicken breast` 같은 단순 generic query translation만 담당한다. `KoreanFoodCatalog`는 `콰삭킹 -> BHC 콰삭킹 -> verified provider/database/curated route` 같은 음식 identity와 link를 담당한다.

## Alias 추가 방법

`backend/app/data/korean_food_catalog.json`에서 해당 item의 `aliases`에 한국어 별칭을 추가한다.

Alias normalization은 다음을 적용한다.

- Unicode NFKC normalization
- trim
- 중복 공백 제거
- 영문 case-insensitive 비교

서로 다른 두 item이 같은 normalized alias 또는 canonical name을 가지면 validation error가 발생한다. 조용히 하나를 선택하지 않는다.

## 신규 메뉴 추가 방법

1. `id`를 `kr-...` 형태의 stable key로 정한다.
2. `canonicalName`, `brandName`, `category`, `aliases`를 입력한다.
3. 검증된 외부 provider id가 있으면 `matchStrategy: "external_id"`를 사용한다.
4. 일반 음식이면 `matchStrategy: "provider_search"`를 사용한다. 검증된 provider search term만 넣고, 검증 전에는 `searchTerms: []`로 둔다.
5. 외부 provider 경로가 부적합하다고 확인되고 독립 공식 출처가 있으면 `matchStrategy: "curated_nutrition"`을 사용한다. Premier KR 승인 대기 중인 항목은 이 단계로 확정하지 않는다.
6. FatSecret `sourceFoodId/sourceServingId`는 수동 검증 전까지 `null`로 둔다.
7. FatSecret 영양 payload를 catalog JSON에 복제하지 않는다.
8. 확인되지 않은 curated nutrition field는 `null`로 둔다.
9. backend catalog validation 테스트를 추가하거나 기존 resolution 테스트를 확장한다.

## Validation 정책

Catalog load 시 다음을 검사한다.

- duplicate catalog id
- duplicate normalized alias 또는 canonical name
- empty canonicalName
- malformed aliases
- invalid matchStrategy
- malformed externalRefs
- unknown provider
- `external_id`인데 provider ref가 전혀 없는 상태
- `provider_search`인데 provider ref가 전혀 없는 상태
- sourceServingId가 있는데 sourceFoodId가 없는 상태
- `curated_nutrition`인데 nutrition, nutritionSource, verificationStatus가 없는 상태
- nutrition 숫자가 finite non-negative number 또는 `null`이 아닌 상태
- invalid nutritionSource type
- invalid verificationStatus
- non-curated item에 nutrition/source/status field가 들어간 상태

Starter brand menu나 pending provider_search seed처럼 FatSecret link/search term이 아직 검증되지 않은 항목은 provider ref를 유지하되 `sourceFoodId/sourceServingId`를 `null`, `searchTerms`를 empty로 둘 수 있다.

## 현재 Starter Catalog

브랜드 routing 검증 대기 항목:

- BHC 뿌링클
- BHC 콰삭킹
- BHC 맛초킹
- 교촌 허니콤보
- 교촌 레드콤보
- 교촌 오리지날
- 굽네 고추바사삭
- 굽네 오리지널
- 굽네 볼케이노
- 지코바 숯불양념치킨
- 동대문엽기떡볶이 엽기떡볶이
- 동대문엽기떡볶이 로제떡볶이
- 동대문엽기떡볶이 마라떡볶이
- 신전떡볶이 떡볶이

일반 provider search 음식:

- 김치찌개
- 된장찌개
- 순두부찌개
- 부대찌개
- 제육볶음
- 불고기
- 비빔밥
- 김치볶음밥
- 떡볶이
- 순대
- 김밥
- 냉면
- 삼겹살
- 보쌈
- 족발

현재 브랜드 메뉴 14개는 identity/canonicalName/brand/aliases만 등록된 `NEEDS_VERIFICATION` 상태다. Schema v1에서는 `matchStrategy: "external_id"`와 empty FatSecret ref로 저장하지만, `sourceFoodId`, `sourceServingId`, Basic `searchTerms`, nutrition은 모두 검증되지 않았다. Premier Free + South Korea localized dataset 접근 승인이 대기 중이므로, 승인 결과 전에는 `VERIFIED_EXTERNAL_ID`나 `curated_nutrition`으로 확정하지 않는다. BHC 콰삭킹은 Basic diagnostic에서 `Kwasakking`은 후보 없음, `BHC Kwasakking`은 Buc-ee's/BHU 계열 오매칭이 관찰되어 `sourceFoodId`를 설정하지 않는다.

## FatSecret Link Diagnostic

브랜드 exact-link의 `sourceFoodId/sourceServingId`를 사람이 검증할 때는 production API가 아니라 read-only 개발 script를 사용한다.

```powershell
cd backend
.\.venv\Scripts\python.exe scripts\inspect_fatsecret_catalog_links.py "콰삭킹"
.\.venv\Scripts\python.exe scripts\inspect_fatsecret_catalog_links.py "콰삭킹" --search-term "BHC Kwasakking"
.\.venv\Scripts\python.exe scripts\inspect_fatsecret_catalog_links.py --pending
```

이 script는 catalog를 읽고 기존 production `FatSecretFoodProvider`의 Basic search/detail 경로를 재사용해 후보와 상세 serving 목록을 stdout에 출력한다. `korean_food_catalog.json`을 자동 수정하지 않고, 첫 번째 후보를 자동 확정하지 않으며, access token이나 client secret을 출력하지 않는다. `--search-term`은 diagnostic 실행에서만 쓰는 임시 query이고 catalog에 저장하지 않는다.

`sourceFoodId`는 FatSecret의 음식 identity가 catalog item과 일치한다고 사람이 확인한 뒤 수동으로 기록한다. 현재 앱은 사용자가 g을 입력하는 UX이므로 보통 `sourceServingId`는 비워두고 provider의 serving 선택 정책을 사용한다. 특정 serving만 정확한 기준으로 고정해야 할 때만 `sourceServingId`를 기록한다.

## PostgreSQL Migration 방향

현재 JSON 구조는 다음 테이블로 옮기기 쉽게 맞춰져 있다.

```text
foods
- id
- canonical_name
- brand_id
- category

food_aliases
- food_id
- alias
- normalized_alias

external_food_refs
- food_id
- provider
- source_food_id
- source_serving_id
- search_terms

food_nutrition
- food_id
- serving_size
- serving_unit
- calories_kcal
- protein_g
- carbs_g
- fat_g
- verification_status

nutrition_sources
- food_id
- type
- name
- url
- record_id
- checked_at
```

향후 provider 우선순위는 다음 방향이다.

1. `UserFoodProvider`
2. `DatabaseFoodProvider`
3. `FatSecretFoodProvider`

`curated_nutrition` JSON 데이터는 `DatabaseFoodProvider`의 자체 nutrition row로 migration할 수 있다. 자체 DB miss 후 FatSecret fallback으로 바뀌어도 frontend는 `/api/v1/foods/search` contract만 유지하면 된다.
