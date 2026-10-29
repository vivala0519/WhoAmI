# REA MCP 조사 기록

대상: https://www.transfermarkt.co.uk/whoami

수집일: 2026-10-29. 사용자가 연 Chrome CDP `127.0.0.1:9222`에 연결했습니다.

## 확인한 증거

1. `list_browser_targets`: `WHO AM I? | Football quiz | Transfermarkt` 페이지 확인.
2. `inspect_web_page`: 접근성 트리에서 Daily challenge / Unlimited / 검색 / How to play / Reveal player를 확인.
3. `capture_web_screenshot`: 남색 게임 배경, 모드 전환, 리그·최소 몸값 배지, 3문제 진행 표시 확인.
4. `capture_browser_scenario`: 무제한 전환 및 Haaland 검색. 원본 초기 설정 응답을 캡처. 원본 서비스 워커는 allow로 관찰했으며 삭제하지 않음.
5. `inspect_web_page`에 실제 관찰된 CDN origin을 추가하여 who-am-i 공개 번들 수집. 코드를 실행하지 않고 문자열과 API 경로를 정적으로 읽음.
6. 번들이 명시한 공개 `/players`, `/clubs`, `/competitions`, `/attributes` API에서 실재 선수 380명 속성 확보. 공개 daily/check 요청 1회로 반환 형식을 확인.

## 확인된 규칙

`initial.json`의 dailyConfig: amountTries 8, amountPlayers 3, competitionIds GB1, minMarketValue 3000000. infiniteConfig: amountTries 8, limit 250.

초기 설정의 안내와 공개 번들의 `Ds` 항목 순서: nationality, competition, club, position, age, shirtNumber, marketValue. 프런트엔드는 정확한 일치와 같은 계열 여부를 독립적으로 받아 칠하고, 숫자의 direction을 화살표로 렌더링함.

`comparison-probe.json`: 홀란 추측에 대해 국적·구단 불일치, 리그 일치, 포지션 계열 일치, 나이 일치, 등번호 UP, 시장가치 DOWN이 반환됨. 숫자 근접도 임계값은 관찰되지 않았으며 추가하지 않음. 국적·리그·구단은 ID 일치만, 포지션은 positionGroup까지 비교함.

원본 영문 검색은 최소 3글자를 요구함. 한국어 표기에 맞추어 이 구현은 한글 1글자·초성도 즉시 검색함. 원본은 서버에서 정답을 감추지만 독립 정적 앱의 정답은 로컬에 존재함. 경쟁·보상 목적의 서버 검증은 구현 범위에 포함하지 않음.

## 로컬 증거

- `evidence/original-bundle.js`: REA가 캡처한 공개 프런트엔드. 앱에서는 import하거나 실행하지 않음.
- `evidence/initial.json`: REA 네트워크 캡처에서 추출한 초기 규칙.
- `evidence/comparison-probe.json`: 공개 게임 비교 응답.
- `evidence/players.json`, `entities.json`, `pools.json`: 수집한 공개 데이터.
- `src/players.json`: 게임 실행에 필요한 속성으로 축소하고 한국어화한 데이터.

원본 서버의 매일 정답 선택과 계정·세계 순위·서버 내부 로직은 재현했다고 주장하지 않음. 로컬의 일일 문제 선택은 한국 날짜를 이용한 결정적 셔플이며, 매일 3개의 중복 없는 문제를 제공함.
