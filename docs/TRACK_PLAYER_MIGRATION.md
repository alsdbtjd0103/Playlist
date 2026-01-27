# React Native Track Player 마이그레이션 가이드

## 버전 정보

- **react-native-track-player**: 5.0.0-alpha0
- **React Native**: 0.81.5

## 변경 사항 요약

### 1. **녹음 기능** (변경 없음)
- `expo-audio`의 `useAudioRecorder` 계속 사용
- 녹음 관련 코드는 그대로 유지

### 2. **재생 기능** (완전히 변경됨)
- `expo-audio`의 `useAudioPlayer` 제거
- `react-native-track-player` 사용

---

## 새로운 기능

### 백그라운드 재생
- 앱이 백그라운드에 있어도 계속 재생됨
- iOS: 앱 전환 시에도 중단 없이 재생
- Android: 포그라운드 서비스로 재생 유지

### 잠금화면 미디어 컨트롤
- 재생/일시정지
- 다음 곡
- 이전 곡
- 곡 정보 표시 (제목, 아티스트)
- 프로그레스 바 및 시간 표시

### 알림센터 컨트롤
- iOS: Control Center에서 컨트롤
- Android: 알림에서 컨트롤

---

## 변경된 파일

### 새로 추가된 파일
- `services/PlaybackService.ts` - TrackPlayer 백그라운드 서비스

### 수정된 파일
1. **App.tsx**
   - TrackPlayer 서비스 등록 추가

2. **contexts/PlayerContext.tsx** (대규모 변경)
   - `expo-audio` → `react-native-track-player`
   - TrackPlayer 초기화 로직 추가
   - 잠금화면 컨트롤 설정
   - 플레이리스트 큐 관리

3. **components/AudioPlayer.tsx**
   - `player` prop 제거
   - TrackPlayer는 전역 상태로 관리됨

---

## 사용 방법

### 단일 곡 재생
```typescript
const { setCurrentTrack } = usePlayer();

setCurrentTrack({
  song: songData,
  version: versionData
});
```

### 플레이리스트 재생
```typescript
const { setPlaylist } = usePlayer();

setPlaylist(playingTracks, startIndex);
```

### 재생 컨트롤
```typescript
const { togglePlayPause, seekTo, playNext, playPrevious } = usePlayer();

togglePlayPause();  // 재생/일시정지
seekTo(30);         // 30초 위치로 이동
playNext();         // 다음 곡
playPrevious();     // 이전 곡
```

---

## 빌드 및 실행

### iOS
```bash
# CocoaPods 설치
npx pod-install

# 빌드 및 실행
npm run ios
```

### Android
```bash
# 빌드 및 실행
npm run android
```

---

## 주의사항

### 1. Native 모듈 재빌드 필수
- `react-native-track-player`는 네이티브 모듈이므로 반드시 네이티브 빌드 필요
- Expo Go에서는 작동하지 않음
- Development Build 또는 실제 빌드에서만 작동

### 2. 권한 설정 (이미 완료됨)
**iOS** (`app.json`):
```json
"UIBackgroundModes": ["audio"]
```

**Android** (`app.json`):
```json
"permissions": [
  "android.permission.FOREGROUND_SERVICE",
  "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
  "android.permission.WAKE_LOCK"
]
```

### 3. 오디오 세션
- TrackPlayer가 자동으로 오디오 세션 관리
- 다른 앱의 오디오와 자동으로 믹싱 처리
- 전화나 알람이 오면 자동으로 일시정지

---

## 트러블슈팅

### "트랙 설정 실패" 에러
- 파일 경로가 올바른지 확인
- 파일이 실제로 존재하는지 확인
- 로컬 파일 URL은 `file://`로 시작해야 함

### 잠금화면에 컨트롤이 안 보임
- iOS: 시뮬레이터에서는 제한적일 수 있음 (실제 기기에서 테스트)
- Android: 알림 권한 확인

### 백그라운드 재생이 안 됨
- iOS: `UIBackgroundModes` 설정 확인
- Android: `FOREGROUND_SERVICE` 권한 확인
- 네이티브 빌드가 제대로 되었는지 확인

---

## 참고 자료

- [React Native Track Player 공식 문서](https://rntp.dev/)
- [API Reference](https://rntp.dev/docs/api/)
- [Background Mode Guide](https://rntp.dev/docs/capabilities/)
