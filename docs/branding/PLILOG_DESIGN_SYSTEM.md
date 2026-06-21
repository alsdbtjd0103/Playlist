# 플리로그(plilog) 디자인 시스템

> 작성: 2026-06-21 · 상태: 확정(v1) · 대상: 혼자 노래를 녹음하고 버전을 별점·메모로 관리하며 개인 플레이리스트로 모아 재생하는 React Native(Expo) 앱
>
> 이 문서는 `docs/BRANDING_REPORT.md`(방구석 플레이리스트 / 옐로 시그니처안)를 **대체**한다. 이전 보고서는 deprecated.

---

## 0. 한눈에 보기

| 항목 | 결정 |
|---|---|
| 이름 | **플리로그 / plilog** (워드마크는 소문자 `plilog`, 문장 시작은 `Plilog`) |
| 콘셉트 | "남에게 보여주지 않는, 나만의 따뜻한 연습실" — 코지 웜(cozy warm cabin) 미니멀 |
| 톤 | 따뜻하되 **귀엽지 않게**. 어른스러운 미니멀. 장식보다 색·여백·온도로 따뜻함을 만든다 |
| 라이트 테마 | **웜 샌드** — 모래빛 크림 배경 + 클레이 테라코타 포인트 |
| 다크 테마 | **웜 차콜** — 따뜻한 차콜 배경 + 앰버 포인트 |
| 듀얼 테마 | 시스템 테마 추종(automatic) 기본 + 앱 내 토글 |
| 폰트 | 라틴 **Manrope**, 한글 **Pretendard**(권장) 또는 IBM Plex Sans KR |
| 포인트 컬러 | 따뜻한 단일 액센트(테라코타/앰버)만. 면적은 중성 베이스가 지배, 액센트는 좁게 |
| 로고 모티프 | `plilog` 워드마크 + 앰버 파형(waveform). 파형 = 로고 = 녹음화면 = 프로그레스바 |

근거 요약: "어시(earthy)·테라코타/샌드" 팔레트는 2026 모바일 디자인의 주요 흐름으로, **차분함·진정성**을 전달하며 **액센트로 절제 사용**할 때 가장 효과적이다(지배색은 중성 톤). 본 시스템은 이 원칙 위에 접근성(WCAG 2.1 AA)을 실측으로 맞춰 토큰을 확정했다.

---

## 1. 컬러 시스템

### 1-1. 설계 원칙

1. **지배색은 중성, 액센트는 좁게.** 화면의 대부분은 크림/차콜 중성 톤이고, 테라코타·앰버는 로고·활성·재생·별점·강조 버튼에만 쓴다. 따뜻한 색을 넓게 깔면 "누런 화면"이 되어 가독성과 세련됨을 동시에 잃는다.
2. **브랜드 액센트와 시맨틱 색을 분리한다.** 테라코타/앰버는 브랜드 정체성 색이지 "성공/경고/오류" 신호가 아니다. 상태 전달은 별도 시맨틱 색(세이지 그린 = 성공, 웜 레드 = 오류/녹음)으로 한다.
3. **글자용 색과 면적용 색을 분리한다.** 따뜻한 라이트 톤의 함정: 같은 테라코타라도 큰 면(버튼 채움·아이콘)에서는 충분하지만 **작은 글자**로 쓰면 대비가 부족하다. 그래서 `accent`(면적)와 `accentStrong`(글자·솔리드 버튼)을 나눈다.

### 1-2. 최종 토큰 — 라이트(웜 샌드)

| 토큰 | HEX | 용도 | 대비 검증 |
|---|---|---|---|
| `bg` | `#f4ecdd` | 앱 배경 | — |
| `surface` | `#fffdf9` | 카드·시트·검색바 | — |
| `surfaceAlt` | `#faf0e4` | 미니플레이어 등 보조 면 | — |
| `text` | `#2f2820` | 본문·제목 | 12.4:1 (AAA) on bg |
| `textMuted` | `#74664f` | 보조 텍스트·메모·날짜 | 4.8:1 (AA) on bg · **보정값** |
| `textFaint` | `#998a76` | 비활성/장식 전용(필수 정보 금지) | 2.9:1 (의도적 저대비) |
| `border` | `#e6dac6` | 카드 외곽선(장식) | 면+그림자로 구분, 단독 의존 금지 |
| `accent` | `#c2703d` | 브랜드 포인트: 아이콘·활성·파형·큰 면 | 3.2:1 (비텍스트 3:1 통과) |
| `accentStrong` | `#a8542a` | 액센트 **글자·링크**, 솔리드 버튼 채움 | 4.5:1 (AA text) / 흰 글자 5.3:1 |
| `star` | `#b87a26` | 별점 채움(의미 있는 아이콘) | 3.1:1 (비텍스트 3:1 통과) |
| `onAccent` | `#ffffff` | `accentStrong` 버튼 위 글자 | 5.3:1 (AA) |
| `success` | `#52684d` | 성공/완료(세이지) | 5.2:1 (AA) |
| `danger` | `#b3402e` | 오류·삭제·**녹음(REC)** | 4.9:1 (AA) |

> 주의: 원래 후보였던 `muted #998a76`(2.9:1)와 `accent2 #d99a3c`(2.1~2.4:1)는 AA 미달이라 위처럼 보정했다. `#c2703d`를 **솔리드 버튼에 흰 글자**로 쓰면 3.7:1로 미달이므로, 솔리드 버튼 채움은 `accentStrong #a8542a`를 쓴다. `#c2703d`를 버튼에 꼭 쓰려면 라벨을 18.66px 볼드(=큰 텍스트, 3:1 기준) 이상으로.

### 1-3. 최종 토큰 — 다크(웜 차콜)

다크 팔레트는 실측 결과 **전 항목 AA/AAA 통과**로 보정 없이 그대로 사용한다.

| 토큰 | HEX | 용도 | 대비 검증 |
|---|---|---|---|
| `bg` | `#1a1815` | 앱 배경 | — |
| `surface` | `#2b2620` | 카드·시트·검색바 | — |
| `surfaceAlt` | `#2f2a22` | 보조 면 | — |
| `text` | `#efe7da` | 본문·제목 | 14.4:1 (AAA) on bg |
| `textMuted` | `#a89c8a` | 보조 텍스트 | 6.6:1 / surface 5.6:1 (AA) |
| `border` | `#3d362d` | 카드 외곽선(장식) | 면+그림자로 구분 |
| `accent` | `#e2a85b` | 브랜드 포인트·글자·아이콘·파형 | 8.4:1 (AAA) on bg |
| `accentStrong` | `#e2a85b` | 솔리드 버튼 채움(어두운 글자) | 동일 |
| `star` | `#ecbd74` | 별점 채움 | 8.6:1 (AAA) on surface |
| `onAccent` | `#241a0c` | 액센트 버튼 위 글자(어두운 잉크) | 8.1:1 (AAA) |
| `success` | `#8fae84` | 성공/완료(세이지) | 7.2:1 (AAA) |
| `danger` | `#e6705f` | 오류·삭제·녹음(REC) | 5.8:1 (AA) |

### 1-4. 접근성 기준(요약)

- 본문 텍스트 **4.5:1**, 큰 텍스트(24px 이상 또는 18.66px 볼드) **3:1**.
- 아이콘·별점·파형·프로그레스·UI 컴포넌트 경계 등 **비텍스트 요소 3:1**(WCAG 2.1 SC 1.4.11). 단, 순수 장식이나 비활성 요소는 면제.
- 경계선이 컴포넌트를 구분하는 **유일한** 수단일 때만 3:1이 필요하다. plilog 카드는 배경과 다른 면 색 + 그림자로 구분되므로 부드러운 저대비 외곽선은 허용된다. **경계선에만 의존하지 말 것.**
- 토큰 변경 시 [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)로 재검증.

---

## 2. 타이포그래피

### 2-1. 폰트

- **라틴/숫자/워드마크: Manrope** — 둥근 그로테스크 산세리프. 따뜻하면서 모던.
- **한글: Pretendard(권장)** — 9종 웨이트 + 가변(45–920), OFL 라이선스로 무료, RN 임베드 가능. 대안 **IBM Plex Sans KR**(OFL, 무료).
- 단순화 옵션: **Pretendard 단독**으로 한글·라틴을 모두 처리하면 메트릭 일관성이 가장 좋다. 이 경우 Manrope는 `plilog` 워드마크/큰 숫자에만 한정.

> 검증 메모: "Pretendard가 Inter 기반이라 Manrope와 기하학적으로 호환된다"는 통설은 이번 리서치에서 **반증(1-2)**됐다. 두 폰트 페어링은 가능하지만 **실기기에서 같은 px의 한글/라틴 글자 크기·베이스라인 정렬을 반드시 눈으로 검증**하고, 어긋나면 한글 글자에 미세 `fontSize`/`lineHeight` 보정을 둘 것. 일관성을 최우선한다면 Pretendard 단독을 택한다.

### 2-2. 위계 (모바일 기준)

| 역할 | 크기/굵기 | 비고 |
|---|---|---|
| Display(빈 상태 타이틀 등) | 28 / 800 | 화면당 1회 |
| H1 화면 제목 | 24 / 700 | |
| H2 섹션 | 20 / 700 | |
| Title 카드 제목/곡명 | 16 / 700 | `text` |
| Body | 15–16 / 500 | `text` |
| Label 버튼 | 15–16 / 700 | 솔리드 버튼은 `onAccent` |
| Caption 메모·날짜·보조 | 13 / 500 | `textMuted` |
| Micro 별점 수치·탭 라벨 | 11–12 / 700 | |

- 한글은 라틴보다 시각적으로 작아 보이므로 본문은 **15px 이상** 권장, 행간 1.5 전후.
- 자간: 큰 제목·워드마크는 `-0.5 ~ -0.8px`로 살짝 조이면 모던한 인상.

---

## 3. 로고 / 모티프

- 워드마크 `plilog`(전부 소문자). 라이트는 `accentStrong`, 다크는 `accent` 색.
- **앰버 파형(waveform)** 을 브랜드 코어 모티프로: 로고 옆 파형 → 녹음 화면의 레벨미터 → 재생 프로그레스바를 **하나의 시각 언어**로 통일. 적은 비용으로 강한 일관성.
- 파형은 둥근 끝(rounded) 막대 6~5개. 색은 `accent`. 비텍스트 3:1을 만족(라이트 `#c2703d`, 다크 `#e2a85b`).
- 앱 아이콘/스플래시: 중성 베이스(라이트 `#f4ecdd` / 다크 `#1a1815`) + 중앙 앰버 파형 + `plilog`. 기존 흰 마이크 아이콘과 "방구석 플레이리스트" 텍스트는 교체.

---

## 4. 형태 · 간격 · 모서리

워밍 미니멀의 핵심은 **여백과 절제**다. 요소를 늘리지 말고 숨 쉴 공간을 준다.

- **모서리(radius)**: sm 8 / md 12 / **카드 16** / pill 14 / full 9999. 너무 둥글면(20+) 귀여워지고, 너무 각지면 차가워진다. 16 전후가 "따뜻하지만 어른스러운" 지점.
- **간격(spacing)**: 4 / 8 / 12 / 16 / 24 / 32. 카드 패딩 12–14, 카드 간 간격 10–12, 화면 좌우 패딩 16.
- **그림자**: 라이트는 아주 옅게(`0 2px 8px rgba(70,45,20,0.05)`) — 따뜻한 갈색 계열 그림자. 다크는 깊게(`0 6px 16px rgba(0,0,0,0.4)`)로 카드를 띄워 대비 확보.
- 카드 구분은 **면 색 + 그림자**가 1차, 경계선은 보조.

---

## 5. 모션 · 마이크로인터랙션 · 질감

- **절제가 원칙.** 코지함은 화려한 애니메이션이 아니라 부드러운 타이밍에서 온다. 전환 120–180ms, ease-out. 스프링은 약하게(과한 bounce는 귀여움/장난스러움으로 읽힘).
- 재생 중 미니플레이어의 작은 **이퀄라이저 막대**(2–3개)나 파형의 재생점 이동 같은 "살아있는" 디테일 1–2개면 충분.
- 햅틱: 녹음 시작/정지, 별점 선택 등 의미 있는 순간에만 가볍게.
- **질감(노이즈/페이퍼 텍스처)**: 매우 보수적으로. 쓴다면 라이트 배경에 1–3% 불투명도의 미세 노이즈로 "종이결" 정도. 카드/텍스트 위에는 얹지 않는다. (이 항목은 신뢰할 만한 1차 출처가 적어 **선택 사항**으로 두고, 가독성에 영향 주면 즉시 제거.)

---

## 6. 컴포넌트 가이드

모든 색은 위 토큰을 참조(하드코딩 금지).

- **헤더(ScreenHeader)**: 좌측 `plilog` 워드마크 + 앰버 파형, 우측 액션. 배경 `bg`.
- **곡 카드(SongItem)**: `surface` 면, 좌측 썸네일(음표 아이콘 `accent`), 제목 `text`/아티스트 `textMuted`, 우측 별점. 라운드 16.
- **별점**: 채운 별 `star`, 빈 별 `border`/`textFaint`. 별점 옆 숫자는 `textMuted`(별 색을 글자에 쓰지 않는다).
- **검색바**: `surface` + `border`, 플레이스홀더 `textMuted`(보정값이라 AA 통과).
- **녹음 화면(RecorderModal)**: 녹음 버튼·REC 표시는 **시맨틱 `danger`**(브랜드 앰버 아님 — 녹음은 상태 신호). 완료 별점은 `star`, 저장 버튼은 `accentStrong` 솔리드. 권한 거부 상태도 `danger`.
- **미니플레이어**: `surfaceAlt`. 재생/일시정지 아이콘 `accent`, 닫기 `textMuted`. 재생 중 이퀄라이저 `accent`.
- **NowPlaying / 프로그레스**: 트랙 채움·썸 `accent`, 미채움 `border`. 별점 `star`.
- **탭바**: 활성 아이콘·라벨 `accent`(다크) / `accentStrong`(라이트), 비활성 `textMuted`.
- **빈 상태(Empty State)** — 4가지 유형을 구분하고, **따뜻한 카피 + 명확한 다음 행동(CTA)** 을 둔다. 일러스트는 선택(필수 아님):
  1. **최초 사용**: "아직 녹음한 곡이 없어요. 첫 곡을 추가해볼까요?" + [곡 추가] 버튼.
  2. **검색 결과 없음**: "‘{검색어}’와 맞는 곡이 없어요." (CTA 없이 안내).
  3. **사용자가 비운 상태**(플레이리스트 등): 비운 맥락 안내 + 추가 CTA.
  4. **오류**: 무엇이 잘못됐고 어떻게 복구하는지 + [다시 시도].
  - "데이터 없음" 같은 **게으른 플레이스홀더 문구 금지.**

---

## 7. 라이트/다크 듀얼 테마 아키텍처 (Expo)

### 7-1. 권장 구조

1. **시스템 추종 + 토글.** `app.json`의 `expo.userInterfaceStyle`를 `"automatic"`으로 두어 기기 설정을 따르고, 앱 내 설정에서 라이트/다크/시스템을 고를 수 있게 한다. (현재 값은 `"dark"` 고정 → `"automatic"`으로 변경.)
2. **현재 테마 감지**: `useColorScheme()`(react-native) 훅으로 `'light' | 'dark'`를 구독. 또는 `Appearance.getColorScheme()` / `Appearance.addChangeListener`.
3. **수동 토글**: `Appearance.setColorScheme('light' | 'dark' | null)` — `null`(또는 미지정)이면 다시 시스템을 따른다. 사용자의 선택은 AsyncStorage에 저장하고 부팅 시 복원.
4. **Android**: 시스템 UI(상태바/배경) 일치를 위해 `expo-system-ui`가 필요. 테마 전환 시 배경색을 함께 갱신.
5. **토큰 구조**: `light`/`dark` 두 객체로 **시맨틱 토큰**(위 표의 이름)을 동일 키로 정의하고, `ThemeProvider`(React Context)로 현재 객체를 주입한다. 컴포넌트는 **항상 토큰 이름**으로 접근하고 HEX를 직접 쓰지 않는다.

### 7-2. 토큰 모듈 스케치 (`lib/theme.ts` 재구성)

```ts
export const lightColors = {
  bg: '#f4ecdd', surface: '#fffdf9', surfaceAlt: '#faf0e4',
  text: '#2f2820', textMuted: '#74664f', textFaint: '#998a76',
  border: '#e6dac6',
  accent: '#c2703d', accentStrong: '#a8542a', star: '#b87a26',
  onAccent: '#ffffff', success: '#52684d', danger: '#b3402e',
} as const;

export const darkColors = {
  bg: '#1a1815', surface: '#2b2620', surfaceAlt: '#2f2a22',
  text: '#efe7da', textMuted: '#a89c8a', textFaint: '#7d7363',
  border: '#3d362d',
  accent: '#e2a85b', accentStrong: '#e2a85b', star: '#ecbd74',
  onAccent: '#241a0c', success: '#8fae84', danger: '#e6705f',
} as const;

export type ColorTokens = typeof lightColors;
```

```tsx
// ThemeContext: useColorScheme() + 사용자 override(AsyncStorage)
const scheme = override ?? useColorScheme() ?? 'light';
const colors = scheme === 'dark' ? darkColors : lightColors;
```

`spacing`/`borderRadius`/`typography`는 테마 무관(공유). 색만 라이트/다크로 분기.

### 7-3. 마이그레이션 메모(현재 코드 기준)

- `App.tsx`: 하드코딩된 `#0f0f0f`(YT뮤직 다크)를 `colors.bg`로, `NavigationContainer` 테마를 라이트/다크 분기. 탭바 활성색 `#ffffff` → `colors.accent`/`accentStrong`.
- `lib/theme.ts`: 기존 YT뮤직 팔레트 → 위 토큰으로 교체.
- 하드코딩 색 제거 대상: `AudioPlayer.tsx`(`#fff`/`#000`/`#888`), `NowPlayingScreen.tsx`(`#0a0a0a`, `#1a1a1a`, `#b3b3b3` 등), `RecorderModal.tsx`(녹음=`danger`), `ScreenHeader.tsx`("Playlist"→`plilog`, 음표→파형).
- `app.json`: `name` "방구석 플레이리스트" → "플리로그", `userInterfaceStyle` `"dark"` → `"automatic"`, 배경/스플래시/아이콘 색 토큰화, `scripts/generate-branding.js`를 파형+`plilog`로 교체 후 자산 재생성.

---

## 8. 실행 체크리스트

- [ ] `lib/theme.ts`를 light/dark 토큰 + `ThemeProvider`로 재구성
- [ ] `useColorScheme` + 사용자 override(AsyncStorage) 연결, `expo-system-ui` 추가
- [ ] `app.json`: 이름·`userInterfaceStyle: automatic`·색 갱신
- [ ] 폰트 적용: Pretendard(또는 +Manrope) 임베드, 위계 토큰화 — **실기기에서 한/영 정렬 검증**
- [ ] 컴포넌트 하드코딩 색 → 토큰 치환(헤더/카드/별점/검색/녹음/미니·풀 플레이어/탭바)
- [ ] 로고: `plilog` 워드마크 + 앰버 파형 컴포넌트, `generate-branding.js` 교체 후 아이콘·스플래시 재생성
- [ ] 빈 상태 4유형 카피·CTA 정비
- [ ] WebAIM Checker로 최종 토큰 재검증(특히 라이트 보정값)

---

## 부록 A. 접근성 실측표 (확정 토큰)

라이트(on `bg #f4ecdd` 기준, 별도 표기 외):

| 쌍 | 대비 | 판정 |
|---|---|---|
| text `#2f2820` | 12.4:1 | AAA |
| textMuted `#74664f` | 4.8:1 | AA |
| accent `#c2703d` (비텍스트) | 3.2:1 | 3:1 통과 |
| accentStrong `#a8542a` (텍스트) | 4.5:1 | AA |
| 흰 글자 on accentStrong | 5.3:1 | AA |
| star `#b87a26` (아이콘) | 3.1:1 | 3:1 통과 |
| success `#52684d` | 5.2:1 | AA |
| danger `#b3402e` | 4.9:1 | AA |

다크(on `bg #1a1815` 기준):

| 쌍 | 대비 | 판정 |
|---|---|---|
| text `#efe7da` | 14.4:1 | AAA |
| textMuted `#a89c8a` | 6.6:1 | AA |
| accent `#e2a85b` | 8.4:1 | AAA |
| 어두운 잉크 on accent | 8.1:1 | AAA |
| star `#ecbd74` (on surface) | 8.6:1 | AAA |
| success `#8fae84` | 7.2:1 | AAA |
| danger `#e6705f` | 5.8:1 | AA |

> 산출: WCAG 2.1 상대 휘도 공식으로 직접 계산. 코드 변경 후 WebAIM Checker로 교차 확인 권장.

## 부록 B. 출처 및 검증 메모

핵심 1차 출처:
- WCAG 대비: [WebAIM Contrast](https://webaim.org/articles/contrast/), [W3C SC 1.4.3](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html), [W3C SC 1.4.11 비텍스트](https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html)
- 디자인 토큰/브랜드·시맨틱 분리: [USWDS Color Tokens](https://designsystem.digital.gov/design-tokens/color/overview/), [UXPin](https://www.uxpin.com/studio/blog/color-consistency-design-systems/)
- 폰트: [Pretendard](https://github.com/orioncactus/pretendard), [IBM Plex](https://github.com/IBM/plex)
- 듀얼 테마: [Expo Color Themes](https://docs.expo.dev/develop/user-interface/color-themes/), [RN useColorScheme](https://reactnative.dev/docs/usecolorscheme)
- 빈 상태: [Mobbin — Empty State](https://mobbin.com/glossary/empty-state)
- 어시 팔레트 트렌드: [Envato — Color Trends](https://elements.envato.com/learn/color-scheme-trends-in-mobile-app-design)

반증되어 채택하지 않은 주장:
- "Pretendard는 Inter 기반이라 Manrope와 자동 호환" → **반증(1-2)**. 페어링은 가능하나 실기기 검증 필요.
- "효과적 빈 상태는 컨텍스트·CTA·일러스트 3요소를 **반드시** 포함" → **반증(0-3)**. 일러스트는 선택. 유형별 적절한 카피+CTA가 핵심.

리서치 규모: 5개 앵글 · 23개 소스 페치 · 90개 주장 추출 · 25개 적대적 검증(3표) · 23개 채택.
