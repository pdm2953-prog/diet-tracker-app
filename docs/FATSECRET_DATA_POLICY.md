# FatSecret Data Policy Notes

이 문서는 현재 구현의 데이터 저장 흐름과 FatSecret 연동 시 production 전에 확인해야 할 정책 리스크를 정리한다. 법률적 결론이 아니며, 출시 전 FatSecret 이용 조건과 계약 범위를 별도로 검토해야 한다.

## 현재 local storage 저장 흐름

프론트엔드는 `diet-tracker-app:app-data` key에 `AppDataSnapshot` 전체를 JSON으로 저장한다. 사용자가 backend 검색 결과를 식단에 추가하면 선택된 `Food`가 top-level `foods` 배열에 들어갈 수 있다.

현재 FatSecret provider 결과에서 local storage에 저장될 수 있는 필드는 다음과 같다.

| 위치 | 저장될 수 있는 필드 |
| --- | --- |
| `foods[]` | `id`, `source`, `sourceFoodId`, `sourceFoodName`, `name`, `displayName`, `brandName`, `category`, `catalogId`, `canonicalName`, `servingSize`, `servingUnit`, `nutritionPerServing`, `updatedAt`, `dataSource`, `sourceServingId`, `servingDescription`, `sourceRegion`, `nutritionSource`, `verificationStatus` |
| `foods[].nutritionPerServing` | `caloriesKcal`, `carbohydrateG`, `proteinG`, `fatG`, plus 앱 내부 nullable nutrition fields |
| `mealsByDate.*[].foods[]` | `foodId`, `consumedGrams`, `calculatedNutrition`, checked state, timestamps |
| `fixedMealTemplates[].items[].foodSnapshot` | 고정 식단으로 승격한 경우 선택 당시 `Food` snapshot 전체 |

이번 작업은 backend DB 영구 저장이나 장기 cache를 추가하지 않는다. 다만 frontend 개발용 local storage에는 선택된 FatSecret 기반 `Food` 값과 계산된 영양값이 남을 수 있다. 이 상태를 production-ready 저장 정책으로 간주하면 안 된다.

`nutritionSource`와 `verificationStatus`는 `curated_nutrition` 결과의 provider-neutral 출처 추적 metadata다. FatSecret nutrition payload를 catalog curated 값으로 복제하는 용도로 쓰면 안 되며, 식약처/브랜드/제조사 등 독립적으로 사용 가능한 출처가 있을 때만 저장한다.

## FatSecret storable data 검토 필요 사항

FatSecret API 데이터는 공공 데이터가 아니며, 공식 API 문서와 platform terms/계약에서 저장, caching, 재배포, 파생 데이터 보존 범위를 제한할 수 있다.

production 출시 전 최소 확인 항목:

- 음식명, 브랜드명, serving 설명, 영양값을 사용자 기기에 저장할 수 있는지
- 저장 가능하다면 허용되는 필드, 보존 기간, cache invalidation 조건
- `sourceFoodId`와 `sourceServingId` 같은 provider identifier만 저장하는 방식이 허용되는지
- `catalogId`와 `canonicalName` 같은 자체 identity metadata를 provider payload와 분리해 저장하는 방식이 충분한지
- 사용자가 만든 meal 기록의 `calculatedNutrition`이 FatSecret 데이터의 저장 또는 파생 데이터 저장으로 취급되는지
- fixed meal template의 `foodSnapshot` 보존이 계약상 허용되는지
- region/language별 데이터 접근 권한과 화면 표시 요구 사항

## 안전한 대안

1. `sourceFoodId`와 `sourceServingId` 중심 저장

   local storage와 backend DB에는 provider 식별자, 사용자 입력 g 수, meal 연결 정보만 저장한다. 음식명과 영양값 snapshot은 저장하지 않거나 짧은 세션 cache로 제한한다.

2. 표시 시 backend 재조회

   화면 표시와 계산 시 backend가 FatSecret provider로 `food.get`을 다시 호출한다. API 장애 시 기존 meal 표시에 필요한 fallback UX가 필요하다.

3. 계약상 허용된 자체 snapshot 정책

   FatSecret 계약에서 특정 필드나 보존 기간을 허용하는 경우에만 snapshot 저장 정책을 문서화하고 구현한다. 허용 범위, 삭제 정책, refresh 주기를 코드와 문서에 같이 고정한다.

## 자체 DB provider 전환 migration 계획

향후 `DatabaseFoodProvider`로 전환할 때는 `FoodProvider` 인터페이스를 그대로 구현하고 provider factory에 `database` 값을 추가한다.

권장 migration 순서:

1. 기존 local storage에서 `dataSource === "fatsecret"`인 Food를 식별한다.
2. 가능한 경우 `sourceFoodId/sourceServingId`를 기준으로 backend에서 최신 표시 데이터를 재조회한다.
3. 자체 DB에 매핑된 canonical food가 있으면 `foodId`를 자체 DB id로 연결한다.
4. 계약상 snapshot 보존이 허용되지 않는 필드는 local storage migration에서 제거하거나 provider id 중심 구조로 축소한다.
5. 사용자 meal의 `consumedGrams`, checked state, 날짜, meal type은 사용자 생성 기록으로 유지한다.
6. `calculatedNutrition`은 자체 DB 기준으로 재계산하거나, 계약 검토 후 허용된 snapshot만 유지한다.

현재 개발용 local storage 구조는 편의상 동작을 유지하기 위한 것이며, FatSecret production 데이터 보존 정책으로 확정된 것이 아니다.
