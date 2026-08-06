# API Contract

이 문서는 Expo React Native 앱과 FastAPI 백엔드 사이의 1차 로컬 통신 계약을 정의한다.

현재 단계에서는 FatSecret API를 실제로 호출하지 않는다. `FATSECRET_CLIENT_ID`와 `FATSECRET_CLIENT_SECRET` 설정 자리만 준비하고, 검색 API는 한국 음식 mock 데이터를 반환한다.

## Base URL

로컬 백엔드 기본 실행 예시는 다음과 같다.

```text
http://127.0.0.1:8000
```

프론트엔드는 `EXPO_PUBLIC_BACKEND_URL`로 백엔드 URL을 주입한다. 값이 없으면 개발 기본값 `http://127.0.0.1:8000`을 사용한다. 음식 검색 provider는 `EXPO_PUBLIC_FOOD_SEARCH_PROVIDER`로 선택한다.

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
| `pageSize` | number | 아니오 | `20` | 페이지 크기. 현재 최대 `100` |

공백 검색어, 2자 미만 검색어, `page < 1`, `pageSize < 1`, `pageSize > 100`은 `422` validation 오류로 처리한다.

### Response 200

```json
{
  "items": [
    {
      "id": "mock-chicken-breast",
      "name": "닭가슴살",
      "brandName": null,
      "servingSize": 100,
      "servingUnit": "g",
      "nutritionPerServing": {
        "caloriesKcal": 165,
        "proteinG": 31,
        "carbsG": 0,
        "fatG": 3.6
      }
    }
  ],
  "page": 1,
  "pageSize": 20,
  "hasMore": false
}
```

검색 결과가 없으면 `items: []`, `hasMore: false`를 반환한다.

## 타입 매핑 정책

백엔드 DTO는 API 계약을 안정화하기 위한 얇은 응답 모델이다. 프론트엔드 앱 내부의 `Food` 모델과 완전히 같지 않으므로 `src/services/backendFoodAdapter.ts`에서 변환한다.

| Backend DTO | Frontend `Food` |
| --- | --- |
| `id` | `id`, `sourceFoodId` |
| 고정값 없음 | `source: "backend-food-search"` |
| `name` | `name` |
| `brandName` | `brandName` |
| 없음 | `category: null` |
| `servingSize` | `servingSize` |
| `servingUnit` | `servingUnit` |
| `nutritionPerServing.caloriesKcal` | `nutritionPerServing.caloriesKcal` |
| `nutritionPerServing.proteinG` | `nutritionPerServing.proteinG` |
| `nutritionPerServing.carbsG` | `nutritionPerServing.carbohydrateG` |
| `nutritionPerServing.fatG` | `nutritionPerServing.fatG` |
| 없음 | 당류, 나트륨, 식이섬유, 포화지방, 트랜스지방, 콜레스테롤은 `null` |

실제 `0`과 정보 없음 `null`은 구분한다. adapter는 `0`을 결측값으로 바꾸지 않으며, 백엔드가 제공하지 않는 영양 필드만 `null`로 채운다.

## 다음 단계: FatSecret 연동

다음 단계에서 백엔드는 FatSecret OAuth 토큰 발급과 음식 검색 호출을 구현한다. Client Secret은 모바일 앱에 넣지 않고 백엔드 환경변수로만 관리한다. FatSecret 원본 응답은 백엔드 내부 adapter에서 현재 DTO 형태로 정규화한 뒤 프론트엔드에 반환한다.
