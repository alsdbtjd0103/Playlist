# Group C 디자인: 검색 trim + 한글 초성 검색

날짜: 2026-06-21
관련 이슈: ③ 검색 시 trim 적용해서 중간에 공백 무시하고 한글 자음만으로도 검색되도록 변경

## 배경

현재 `HomeScreen.tsx:190-194`의 검색은 `song.title.toLowerCase().includes(searchQuery.toLowerCase())`로 단순 부분문자열 매칭만 수행한다. trim도, 내부 공백 무시도, 한국어 초성 검색도 없다.

## 변경 설계

### C-1. 검색 유틸 `lib/search.ts` 신규

세 함수를 export:

```typescript
// 한글 음절에서 초성 1글자 추출. 비한글이면 원본 그대로 반환.
export function getChoseong(char: string): string;

// 문자열 전체에서 초성만 추출. 비한글은 그대로 유지.
export function extractChoseong(text: string): string;

// 검색 대상에 검색어가 매칭되는지 판정.
export function matchesSearch(target: string, query: string): boolean;
```

### matchesSearch 동작

1. query를 trim하고 모든 공백 제거 → `normalizedQuery`.
2. normalizedQuery가 빈 문자열이면 true 반환 (검색어 없으면 모두 표시).
3. target도 모든 공백 제거 → `normalizedTarget`.
4. **일반 매칭**: `normalizedTarget.toLowerCase().includes(normalizedQuery.toLowerCase())` → true이면 즉시 true.
5. **초성 매칭**: normalizedQuery가 한글 자음(ㄱ~ㅎ)만으로 구성되었으면, `extractChoseong(normalizedTarget)`을 만들어 `includes(normalizedQuery)`로 비교.

초성 매칭 트리거 조건은 "query 전체가 한글 자음만"으로 한정. 혼합(예: "ㅂㄱ플")은 미지원 — YAGNI.

### 초성 추출 알고리즘

한글 음절 유니코드 범위: U+AC00 ~ U+D7A3.
음절 코드 `c`의 초성 인덱스: `Math.floor((c - 0xAC00) / 588)`.
초성 19자 테이블: `['ㄱ','ㄲ','ㄴ','ㄷ','ㄸ','ㄹ','ㅁ','ㅂ','ㅃ','ㅅ','ㅆ','ㅇ','ㅈ','ㅉ','ㅊ','ㅋ','ㅌ','ㅍ','ㅎ']`.

음절 범위 밖이거나 이미 자음(ㄱ~ㅎ, U+3131~U+314E)인 경우는 원본 글자 유지.

### "한글 자음만" 판정

문자가 `ㄱ-ㅎ` 범위에 있는지 검사. 검색어 모든 문자가 이 범위면 초성 매칭 활성.

### C-2. HomeScreen 검색 로직 교체

`screens/HomeScreen.tsx:190-194`:

```typescript
import { matchesSearch } from '../lib/search';

const filteredSongs = songs
  ? songs.filter((song) => matchesSearch(song.title, searchQuery))
  : [];
```

### 라이브러리 미사용 결정

es-hangul, hangul-js 등 검토. 이 케이스는 ~40줄로 자체 구현 가능하며 RN 번들 사이즈에 dependency 추가 비용이 가치보다 크다. CLAUDE.md의 "현재 사용중인 라이브러리의 기능을 우선 탐색 후 없을 시 구현" 원칙 부합 — 현재 한국어 처리 라이브러리 없음.

## 테스트 전략

`__tests__/search.test.ts` 신규 작성. 케이스:

1. 정확 매칭: `matchesSearch("방구석", "방구석") === true`
2. 부분 매칭: `matchesSearch("방구석 플레이리스트", "플레이") === true`
3. trim: `matchesSearch("방구석", "  방구석  ") === true`
4. 공백 무시(검색어): `matchesSearch("방구석", "방 구 석") === true`
5. 공백 무시(대상): `matchesSearch("방 구 석", "방구석") === true`
6. 초성 매칭: `matchesSearch("방구석", "ㅂㄱㅅ") === true`
7. 초성 부분 매칭: `matchesSearch("방구석 플레이리스트", "ㅍㄹㅇ") === true`
8. 초성 불일치: `matchesSearch("방구석", "ㅂㄱㅈ") === false`
9. 대소문자 무관: `matchesSearch("Hello", "HELLO") === true`
10. 빈 검색어: `matchesSearch("방구석", "") === true`
11. 빈 검색어(공백만): `matchesSearch("방구석", "   ") === true`
12. 혼합 미지원: `matchesSearch("방구석", "ㅂ구") === false` (자음+한글음절은 일반 매칭으로 fallback, "ㅂ구"는 normalize 후 그대로 비교 → 매치 안 됨)

수동 검증:
- 홈 화면 검색창에서 위 케이스 직접 입력하여 결과 확인.

## 변경 영향 범위

| 파일 | 변경 |
|---|---|
| `lib/search.ts` | 신규 (~40줄, getChoseong/extractChoseong/matchesSearch) |
| `__tests__/search.test.ts` | 신규 (~50줄, 12 케이스) |
| `screens/HomeScreen.tsx` | filter 한 줄 교체 + import 1줄 |

## 의도적 비포함 (out of scope)

- artist 필드 검색: 현재도 title만 검색하며 사용자 요청도 "검색 변경"이지 범위 확장이 아님. 별도 요청 시 추가.
- 초성+음절 혼합 검색 ("ㅂㄱ플"): 알고리즘 복잡도가 늘고 사용자 요청 외 → YAGNI.
- 한자/일본어 등 다국어 처리: 사용 빈도 낮음 → YAGNI.
- 자모 분리(중성/종성 매칭, "ㅁㅏㅅㅣㅆㄸㅏ"): 일반적 검색 패턴 아님 → YAGNI.

## 다음 단계

Group C 완료 후 Group D (스플래시 + 아이콘 브랜딩)로 진행.
