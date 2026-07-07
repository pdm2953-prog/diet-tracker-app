# API Notes

## FatSecret 연동 계획

- FatSecret은 공공데이터가 아니라 외부 API이며, OAuth 2.0 Client ID/Secret이 필요하다.
- 모바일 앱에 FatSecret Client Secret을 직접 넣지 않는다.
- 장기적으로는 앱 -> 백엔드 프록시 -> FatSecret API 구조를 권장한다.
- 현재 MVP 단계에서는 실제 FatSecret 호출을 하지 않고 `mockFoodSearchProvider`를 사용한다.
- 이후 백엔드 프록시가 준비되면 `FoodSearchProvider` 인터페이스의 구현체만 교체한다.
