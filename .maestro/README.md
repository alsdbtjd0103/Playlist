# E2E 테스트 (Maestro)

실제 기기/시뮬레이터에서 앱을 구동해 사용자 플로우를 검증하는 End-to-End 테스트입니다.
유닛/컴포넌트 테스트(`npm test`)와 달리 **빌드된 앱**과 **실행 중인 시뮬레이터/에뮬레이터**가 필요합니다.

## 1. Maestro 설치 (최초 1회)

```bash
curl -fsSL "https://get.maestro.mobile.dev" | bash
# 설치 후 새 터미널에서
maestro --version
```

## 2. 테스트할 앱 준비

이 앱은 네이티브 모듈(expo-audio, react-native-track-player)을 쓰므로 **Expo Go로는 안 되고**,
개발 빌드(dev client)를 시뮬레이터에 설치해야 합니다.

```bash
# iOS 시뮬레이터에 dev build 설치 & 실행
npm run ios

# 또는 Android 에뮬레이터
npm run android
```

> 앱의 `appId`는 `com.playlist.app` 입니다 (iOS/Android 공통). 플로우 yaml 상단에 지정돼 있습니다.

## 3. 실행

```bash
# 전체 플로우 실행
npm run e2e
# 또는 개별 플로우
maestro test .maestro/smoke.yaml
maestro test .maestro/add_song.yaml

# 셀렉터를 눈으로 잡고 싶을 때 (대화형 인스펙터)
maestro studio
```

## 플로우 목록

| 파일 | 검증 내용 |
|------|-----------|
| `smoke.yaml` | 앱 실행 → 홈 화면 진입 |
| `add_song.yaml` | 곡 추가 모달 → 입력 → 목록 노출 |

## Claude Code로 자동화할 때

- Maestro CLI는 종료 코드와 텍스트 로그를 내므로 **Claude가 `maestro test`를 실행하고 결과(pass/fail)를 읽을 수 있습니다.**
- 단, **시뮬레이터를 미리 띄워두고 앱이 설치돼 있어야** 합니다. 빌드/시뮬레이터 부팅은 Claude가 자동으로 못 하는 경우가 많으니 먼저 `npm run ios`로 띄워두세요.
- 마이크 녹음 같은 하드웨어 동작은 시뮬레이터에서 실제 소리 입력이 없어 한계가 있습니다. (재생/UI 플로우 위주로 검증 권장)

## 테스트 가능성(testability) 개선 팁

아이콘 버튼처럼 텍스트가 없는 요소는 Maestro가 잡기 어렵습니다. `testID`를 부여하세요.
예) `components/ScreenHeader.tsx`의 추가 버튼에는 `testID="add-song-button"`이 부여돼 있습니다.

```tsx
<TouchableOpacity testID="add-song-button" accessibilityLabel="곡 추가" onPress={...}>
```
