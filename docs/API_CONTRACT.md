# API Contract

이 문서는 Expo React Native 앱과 FastAPI 백엔드 사이의 음식 검색 계약을 정의한다.

프론트엔드는 FatSecret을 직접 호출하지 않는다. 음식 검색은 항상 FastAPI의 `/api/v1/foods/search`를 호출하고, 백엔드는 `FOOD_PROVIDER` 설정에 따라 `mock` 또는 `fatsecret` provider를 선택한다. 한국 음식명은 backend의 `KoreanFoodCatalog`에서 먼저 identity와 provider ref를 resolve하며, 영문 provider search term과 catalog routing 정보는 frontend contract에 포함하지 않는다.

## Base URL

로컬 백엔드 기본 실행 예시는 다음과 같다.

```text
http://127.0.0.1:8000
```

프론트엔드는 `EXPO_PUBLIC_BACKEND_URL`로 백엔드 URL을 주입한다. 값이 없으면 개발 기본값 `http://127.0.0.1:8000`을 사용한다. 프론트엔드 음식 검색 provider는 `EXPO_PUBLIC_FOOD_SEARCH_PROVIDER`로 선택한다.

| 값 | 동작 |
| --- | --- |
| 미설정 또는 `backend` | FastAPI 백엔드 검색 사용, 오류는 UI 오류 상태로 전달 |
| `mock` | 기존 프론트엔드 mock 검색만 사용 |
| `backend-with-mock-fallback` | 백엔드 오류 시 기존 mock 검색으로 fallback |

mock fallback은 `backend-with-mock-fallback`을 명시했을 때만 동작한다. 기본 provider는 backend이므로 backend URL이 설정된 상태에서 프론트엔드 mock 검색을 우선 사용하지 않는다.

## GET /health

백엔드 프로세스가 응답 가능한지 확인한다.

### Response 200

```json
{
  "status": "ok"
}
```

## GET /api/v1/foods/search

음식명으로 음식을 검색한다.

### Query parameters

| 이름 | 타입 | 필수 | 기본값 | 설명 |
| --- | --- | --- | --- | --- |
| `q` | string | 예 | 없음 | 검색어. 앞뒤 공백 제거 후 2자 이상이어야 한다. |
| `page` | number | 아니오 | `1` | 1부터 시작하는 페이지 번호 |
| `pageSize` | number | 아니오 | `20` | 페이지 크기. 최대 `50` |

공백 검색어, 2자 미만 검색어, `page < 1`, `pageSize < 1`, `pageSize > 50`은 `422` validation 오류로 처리한다. FatSecret Basic provider는 외부 상세 조회 폭을 제한하기 위해 provider 내부에서 `pageSize`를 `FATSECRET_BASIC_MAX_RESULTS` 값으로 추가 제한하며 기본값과 최대 허용값은 `10`이다. Premier provider는 최대 `50` 정책을 유지한다.

### Response 200

```json
{
  "items": [
    {
      "id": "fatsecret-123-456",
      "name": "Chicken Breast",
      "displayName": "닭가슴살",
      "brandName": null,
      "category": null,
      "catalogId": null,
      "canonicalName": null,
      "servingSize": 100,
      "servingUnit": "g",
      "nutritionPerServing": {
        "caloriesKcal": 109,
        "proteinG": 22.98,
        "carbsG": 0,
        "fatG": 1.2
      },
      "dataSource": "fatsecret",
      "sourceFoodId": "123",
      "sourceFoodName": "Chicken Breast",
      "sourceServingId": "456",
      "servingDescription": "100 g",
      "sourceRegion": "US",
      "nutritionSource": null,
      "verificationStatus": null
    }
  ],
  "page": 1,
  "pageSize": 20,
  "hasMore": false,
  "query": {
    "original": "닭가슴살",
    "resolved": "chicken breast",
    "wasTranslated": true,
    "translator": "korean_food_alias",
    "status": "translated"
  }
}
```

검색 결과가 없으면 `200`과 함께 `items: []`, `hasMore: false`를 반환한다. 외부 provider 인증, 권한, rate limit, timeout, invalid response는 검색 결과 없음으로 변환하지 않고 오류 상태 코드로 반환한다.

`dataSource`는 디버그와 출처 추적을 위한 metadata이며 안정적인 provider 분기 API가 아니다. frontend는 알 수 없는 non-empty string 값을 보존해야 하고, 새로운 source 값이 추가되어도 음식 검색/식단 저장 흐름을 실패시키면 안 된다. 더 큰 API 정리에서는 stable source category와 optional sourceProvider를 별도 필드로 분리할 수 있다.

### Optional metadata

기존 frontend 계약을 깨지 않기 위해 다음 필드는 optional이다.

| 필드 | 값 | 설명 |
| --- | --- | --- |
| `displayName` | string 또는 null | 사용자 표시용 음식명. catalog canonical name 또는 `FoodNameLocalizer` 결과를 사용할 수 있다. |
| `category` | string 또는 null | provider-neutral 음식 분류. catalog hit이면 catalog category를 반환할 수 있다. |
| `catalogId` | string 또는 null | `KoreanFoodCatalog` item id. 외부 provider routing id가 아니다. |
| `canonicalName` | string 또는 null | catalog canonical Korean name. |
| `dataSource` | non-empty string | 출처 metadata. 현재 `mock`, `fatsecret` 값을 반환할 수 있으며 향후 `database`, `curated`, `user` 같은 값이 추가될 수 있다. frontend business logic은 이 값을 폐쇄 provider enum으로 취급하지 않는다. |
| `sourceFoodId` | string | 원천 provider의 food id |
| `sourceFoodName` | string | 원천 provider가 반환한 원본 음식명. 자체 DB migration 시 출처 추적용 |
| `sourceServingId` | string 또는 null | 원천 provider의 serving id |
| `servingDescription` | string 또는 null | 원천 provider의 serving 설명 |
| `sourceRegion` | string 또는 null | provider 데이터 region. Basic FatSecret은 `US` |
| `nutritionSource` | object 또는 null | `curated_nutrition` 결과의 provider-neutral 출처 metadata. FatSecret credential이나 externalRefs는 포함하지 않음 |
| `verificationStatus` | string 또는 null | `official`, `reviewed`, `estimated`, `needs_verification` 같은 curated nutrition 검증 상태 |
| response `query` | object 또는 null | 검색어 resolution metadata. 실제 번역 또는 미등록 한국어 alias처럼 query 처리가 달라진 경우 사용 |

## Backend Provider 정책

`FOOD_PROVIDER=mock`은 local mock 데이터를 반환한다.

`FOOD_PROVIDER=fatsecret`은 FatSecret OAuth 2.0 client credentials로 access token을 발급받고, token 만료 전 refresh margin을 적용해 메모리 캐시를 갱신한다. Client ID, Client Secret, access token, FatSecret 원본 응답은 frontend 응답에 포함하지 않는다.

FatSecret Basic은 `scope=basic`, basic search/detail API, US/en 데이터만 사용한다. `FATSECRET_REGION=KR`처럼 Basic에서 한국 시장을 요청하면 명확한 configuration error로 처리한다. Basic 검색에서 한글이 포함된 query는 먼저 `KoreanFoodCatalog`로 exact alias/canonical/brand+food resolution을 시도한다. Catalog item이 `curated_nutrition`이고 `official/reviewed` nutrition을 가지고 있으면 catalog nutrition을 반환한다. `external_id` item이 검증된 `sourceFoodId`를 가지고 있으면 `food.get` direct lookup을 우선한다. `provider_search` item은 검증된 searchTerms로 provider search를 사용한다. Catalog hit이지만 nutrition/link가 아직 검증되지 않았으면 잘못된 외부 후보를 자동 선택하지 않고 빈 결과를 반환한다. Catalog miss일 때만 `backend/app/data/korean_food_aliases.json`의 작은 alias 사전으로 generic query translation을 수행한다. alias도 없으면 FatSecret에 임의 한국어 query를 보내지 않고 정상 빈 결과와 `query.status: "unresolved"` metadata를 반환한다. Catalog provider search term과 externalRefs는 frontend 응답에 노출하지 않는다. Basic 검색 envelope는 `foods.food`만 정상 결과로 읽고, serving 상세가 부족한 항목은 최대 `FATSECRET_DETAIL_CONCURRENCY` 개씩 concurrent `food.get.v2` fallback으로 보강한다.

FatSecret Premier는 `scope=premier`, `foods.search.v5`, `food.get.v5`를 사용하고 `region`, `language`, `format=json`, `flag_default_serving=true`를 전달한다. Premier가 `region=KR`, `language=ko`로 구성되면 한국어 query를 번역하지 않고 원문 그대로 전달한다. frontend `page=1`은 FatSecret `page_number=0`으로 변환한다. Premier 검색 envelope는 `foods_search.results.food`만 정상 결과로 읽고, 검색 응답에 충분한 serving이 있는 항목은 상세 fallback을 호출하지 않는다.

## Error Response

Provider 오류는 다음 형태의 안전한 응답으로 내려간다. 비밀값, access token, 원본 provider 응답, 공인 IP 주소는 포함하지 않는다. FatSecret API error `code`는 숫자와 문자열 모두 처리하며 `20`은 temporary unavailable, `21`은 permission/configuration 계열 오류로 매핑한다.

```json
{
  "detail": {
    "code": "fatsecret_permission_error",
    "message": "FatSecret API permissions are insufficient for this request."
  }
}
```

| 상황 | HTTP status |
| --- | --- |
| 잘못된 서버/provider 설정 | `503` |
| 외부 인증/권한 문제 | `502` |
| 외부 rate limit | `503` |
| timeout/temporary unavailable | `503` |
| invalid provider response | `502` |
| 잘못된 query parameter | `422` |

## 타입 매핑 정책

백엔드 DTO는 API 계약을 안정화하기 위한 얇은 응답 모델이다. 프론트엔드 앱 내부의 `Food` 모델과 완전히 같지 않으므로 `src/services/backendFoodAdapter.ts`에서 변환한다.

| Backend DTO | Frontend `Food` |
| --- | --- |
| `id` | `id` |
| 고정값 없음 | `source: "backend-food-search"` |
| `sourceFoodId` 또는 `id` | `sourceFoodId` |
| `sourceFoodName` | `sourceFoodName` optional |
| `sourceServingId` | `sourceServingId` optional |
| `dataSource` | `dataSource` optional |
| `name` | `name` |
| `brandName` | `brandName` |
| `category` 또는 없음 | `category` 또는 `null` |
| `servingSize` | `servingSize` |
| `servingUnit` | `servingUnit` |
| `servingDescription` | `servingDescription` optional |
| `sourceRegion` | `sourceRegion` optional |
| `nutritionSource` | `nutritionSource` optional |
| `verificationStatus` | `verificationStatus` optional |
| `nutritionPerServing.caloriesKcal` | `nutritionPerServing.caloriesKcal` |
| `nutritionPerServing.proteinG` | `nutritionPerServing.proteinG` |
| `nutritionPerServing.carbsG` | `nutritionPerServing.carbohydrateG` |
| `nutritionPerServing.fatG` | `nutritionPerServing.fatG` |
| 없음 | 당류, 나트륨, 식이섬유, 포화지방, 트랜스지방, 콜레스테롤은 `null` |

실제 `0`과 정보 없음 `null`은 구분한다. adapter는 `0`을 결측값으로 바꾸지 않으며, 백엔드가 제공하지 않는 영양 필드만 `null`로 채운다.
