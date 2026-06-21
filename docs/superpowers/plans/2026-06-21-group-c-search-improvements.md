# Group C 검색 개선 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trim + 내부 공백 무시 + 한글 초성 검색을 지원하는 `matchesSearch` 유틸을 만들고 HomeScreen 검색에 적용한다.

**Architecture:** `lib/search.ts`에 순수 함수 3개(getChoseong, extractChoseong, matchesSearch)를 구현. Jest 테스트로 12 케이스를 보장한 후 HomeScreen filter에 적용. 외부 의존성 없음.

**Tech Stack:** TypeScript, Jest + jest-expo preset.

## Global Constraints

- 코딩 규칙: 함수형, async/await, try-catch (CLAUDE.md).
- 라이브러리 미사용: 한글 처리는 자체 구현 (~40줄). RN 번들 사이즈 절약.
- TDD 강제: search.ts는 순수 함수라 테스트 부담 없음. 테스트 먼저 작성 후 구현.
- 한 작업 = 한 커밋.

---

## File Structure

| 파일 | 책임 | Task |
|---|---|---|
| `__tests__/search.test.ts` | matchesSearch 동작 사양 12 케이스 | Task 1 |
| `lib/search.ts` | getChoseong/extractChoseong/matchesSearch 구현 | Task 1 |
| `screens/HomeScreen.tsx` | filter를 matchesSearch 호출로 교체 | Task 2 |

Task 1은 TDD라 테스트와 구현이 한 task 안에 묶임.

---

## Task 1: 검색 유틸 + 테스트 (TDD)

**Files:**
- Create: `__tests__/search.test.ts`
- Create: `lib/search.ts`

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces:
  - `getChoseong(char: string): string` — 한글 음절이면 초성, 아니면 원본.
  - `extractChoseong(text: string): string` — 모든 한글 음절을 초성으로 치환, 비한글은 유지.
  - `matchesSearch(target: string, query: string): boolean` — 검색 매칭 판정.

- [ ] **Step 1: 실패하는 테스트 작성**

`__tests__/search.test.ts` 생성:

```typescript
import { matchesSearch, getChoseong, extractChoseong } from '../lib/search';

describe('getChoseong', () => {
  it('한글 음절에서 초성 추출', () => {
    expect(getChoseong('방')).toBe('ㅂ');
    expect(getChoseong('구')).toBe('ㄱ');
    expect(getChoseong('석')).toBe('ㅅ');
  });

  it('비한글은 원본 유지', () => {
    expect(getChoseong('a')).toBe('a');
    expect(getChoseong('1')).toBe('1');
    expect(getChoseong(' ')).toBe(' ');
  });

  it('이미 자음이면 그대로', () => {
    expect(getChoseong('ㅂ')).toBe('ㅂ');
  });
});

describe('extractChoseong', () => {
  it('한글 문장의 모든 초성 추출', () => {
    expect(extractChoseong('방구석')).toBe('ㅂㄱㅅ');
    expect(extractChoseong('플레이리스트')).toBe('ㅍㄹㅇㄹㅅㅌ');
  });

  it('한글과 비한글 혼합', () => {
    expect(extractChoseong('방 구석 ABC')).toBe('ㅂ ㄱㅅ ABC');
  });
});

describe('matchesSearch', () => {
  it('정확 매칭', () => {
    expect(matchesSearch('방구석', '방구석')).toBe(true);
  });

  it('부분 매칭', () => {
    expect(matchesSearch('방구석 플레이리스트', '플레이')).toBe(true);
  });

  it('검색어 trim', () => {
    expect(matchesSearch('방구석', '  방구석  ')).toBe(true);
  });

  it('검색어 내부 공백 무시', () => {
    expect(matchesSearch('방구석', '방 구 석')).toBe(true);
  });

  it('대상 내부 공백 무시', () => {
    expect(matchesSearch('방 구 석', '방구석')).toBe(true);
  });

  it('초성 전체 매칭', () => {
    expect(matchesSearch('방구석', 'ㅂㄱㅅ')).toBe(true);
  });

  it('초성 부분 매칭', () => {
    expect(matchesSearch('방구석 플레이리스트', 'ㅍㄹㅇ')).toBe(true);
  });

  it('초성 불일치', () => {
    expect(matchesSearch('방구석', 'ㅂㄱㅈ')).toBe(false);
  });

  it('대소문자 무관', () => {
    expect(matchesSearch('Hello', 'HELLO')).toBe(true);
  });

  it('빈 검색어는 모두 매칭', () => {
    expect(matchesSearch('방구석', '')).toBe(true);
  });

  it('공백만 있는 검색어도 모두 매칭', () => {
    expect(matchesSearch('방구석', '   ')).toBe(true);
  });

  it('자음+음절 혼합은 일반 매칭으로 처리', () => {
    expect(matchesSearch('방구석', 'ㅂ구')).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npm test -- search 2>&1 | tail -15
```
Expected: 테스트 실패 (lib/search.ts 없음 또는 함수 미구현).

- [ ] **Step 3: lib/search.ts 구현**

`lib/search.ts` 생성:

```typescript
const CHOSEONG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ',
  'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
];

const HANGUL_SYLLABLE_START = 0xac00;
const HANGUL_SYLLABLE_END = 0xd7a3;
const HANGUL_JAMO_START = 0x3131; // ㄱ
const HANGUL_JAMO_END = 0x314e; // ㅎ

/**
 * 한글 음절에서 초성 1글자 추출. 비한글이면 원본 그대로.
 */
export function getChoseong(char: string): string {
  if (char.length === 0) return char;
  const code = char.charCodeAt(0);
  if (code < HANGUL_SYLLABLE_START || code > HANGUL_SYLLABLE_END) {
    return char;
  }
  const choseongIndex = Math.floor((code - HANGUL_SYLLABLE_START) / 588);
  return CHOSEONG[choseongIndex] ?? char;
}

/**
 * 문자열에서 한글 음절들을 모두 초성으로 변환. 비한글 글자는 그대로 유지.
 */
export function extractChoseong(text: string): string {
  let result = '';
  for (const char of text) {
    result += getChoseong(char);
  }
  return result;
}

/**
 * 문자가 한글 자음(ㄱ~ㅎ)인지 판정.
 */
function isHangulJamo(char: string): boolean {
  if (char.length === 0) return false;
  const code = char.charCodeAt(0);
  return code >= HANGUL_JAMO_START && code <= HANGUL_JAMO_END;
}

/**
 * 모든 공백을 제거.
 */
function stripWhitespace(text: string): string {
  return text.replace(/\s+/g, '');
}

/**
 * 검색 대상에 검색어가 매칭되는지 판정.
 * - 둘 다 trim + 내부 공백 제거 + 소문자화 후 includes 검사.
 * - 검색어가 전부 한글 자음으로만 구성되어 있으면, 대상의 초성을 추출하여 추가 검사.
 */
export function matchesSearch(target: string, query: string): boolean {
  const normalizedQuery = stripWhitespace(query);
  if (normalizedQuery.length === 0) return true;

  const normalizedTarget = stripWhitespace(target);
  const lowerQuery = normalizedQuery.toLowerCase();
  const lowerTarget = normalizedTarget.toLowerCase();

  if (lowerTarget.includes(lowerQuery)) return true;

  // 초성 매칭: 검색어가 전부 한글 자음일 때만 활성
  const isAllJamo = [...normalizedQuery].every(isHangulJamo);
  if (isAllJamo) {
    const targetChoseong = extractChoseong(normalizedTarget);
    if (targetChoseong.includes(normalizedQuery)) return true;
  }

  return false;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npm test -- search 2>&1 | tail -15
```
Expected: 모든 테스트 통과 (test suite 1 passed, 18+ tests passed).

- [ ] **Step 5: TypeScript 검증**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit 2>&1 | grep -v "^contexts/PlayerContext.tsx(84" | grep -v "^hooks/useRecording.ts(47" | grep -v "^__tests__/ScreenHeader"
```
Expected: 출력 없음.

- [ ] **Step 6: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add lib/search.ts __tests__/search.test.ts && git commit -m "feat: 한글 초성 + 공백 무시 검색 유틸 lib/search 추가"
```

---

## Task 2: HomeScreen 검색 로직 교체

**Files:**
- Modify: `screens/HomeScreen.tsx:190-194` (filter 로직), `screens/HomeScreen.tsx` 상단 (import 추가)

**Interfaces:**
- Consumes: `matchesSearch(target: string, query: string): boolean` (Task 1에서 정의)
- Produces: 없음

- [ ] **Step 1: import 추가**

`screens/HomeScreen.tsx` 상단의 import 영역(database import 근처)에 추가:

```typescript
import { matchesSearch } from '../lib/search';
```

정확한 위치는 기존 import 정렬 패턴을 따라 lib/database 근처에 배치.

- [ ] **Step 2: filter 로직 교체**

`screens/HomeScreen.tsx` 라인 190-194:

변경 전:
```typescript
  const filteredSongs = songs
    ? songs.filter((song) =>
        song.title.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];
```

변경 후:
```typescript
  const filteredSongs = songs
    ? songs.filter((song) => matchesSearch(song.title, searchQuery))
    : [];
```

- [ ] **Step 3: TypeScript 검증**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit 2>&1 | grep -v "^contexts/PlayerContext.tsx(84" | grep -v "^hooks/useRecording.ts(47" | grep -v "^__tests__/ScreenHeader"
```
Expected: 출력 없음.

- [ ] **Step 4: 회귀 테스트**

Run:
```bash
cd /Users/ysyss/Desktop/Development/Playlist && npm test 2>&1 | tail -10
```
Expected: 모든 suite 통과.

- [ ] **Step 5: 커밋**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git add screens/HomeScreen.tsx && git commit -m "feat: HomeScreen 검색에 trim + 공백 무시 + 초성 매칭 적용"
```

---

## Final Verification

- [ ] **A. 전체 typecheck + 테스트**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && npx tsc --noEmit && npm test
```
Expected: pre-existing 에러 외 신규 0건, 모든 jest 테스트 통과.

- [ ] **B. git log 확인**

```bash
cd /Users/ysyss/Desktop/Development/Playlist && git log --oneline -4
```
Expected: Task 1, Task 2의 2개 커밋이 최상단.

- [ ] **C. 시뮬레이터 수동 시나리오 (사용자 확인)**

홈 화면 검색창에서 다음 입력 → 매칭 확인:
1. "방구석" → "방구석 플레이리스트" 매칭
2. "방 구 석" → "방구석" 매칭
3. "ㅂㄱㅅ" → "방구석" 매칭
4. "  방구석  " → 매칭 (앞뒤 공백 무시)
5. "ㅍㄹㅇ" → "플레이리스트" 매칭
6. "" → 모든 곡 표시

---

## 다음 단계

Group C 완료 후 Group D (스플래시 + 아이콘 브랜딩)로 진행.
