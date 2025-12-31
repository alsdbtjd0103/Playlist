# 방구석 플레이리스트 - React Native App

개인 노래방 플레이리스트 관리 앱 (네이티브 버전)

## 기술 스택

- **React Native** with Expo
- **TypeScript**
- **AsyncStorage** (로컬 데이터 저장)
- **expo-file-system** (로컬 파일 저장)
- **React Navigation** (네이티브 스택)
- **expo-audio** (오디오 녹음 및 재생)

## 설치 및 실행

### 1. 의존성 설치

```bash
npm install
```

### 2. 개발 서버 실행

```bash
# Expo Go로 실행
npm start

# iOS 시뮬레이터 (Mac만 가능)
npm run ios

# Android 에뮬레이터
npm run android
```

## 프로젝트 구조

```
playlist-app/
├── App.tsx                  # 앱 진입점 및 네비게이션
├── screens/                 # 화면 컴포넌트
│   ├── HomeScreen.tsx       # 홈 (곡 목록)
│   ├── SongDetailScreen.tsx # 곡 상세 (버전 관리)
│   └── PlaylistsScreen.tsx  # 플레이리스트
├── components/              # 재사용 가능한 컴포넌트
│   ├── RecorderModal.tsx    # 녹음 모달
│   └── AudioPlayer.tsx      # 오디오 재생 컴포넌트
├── lib/                     # 로컬 저장소 및 유틸리티
│   ├── database.ts          # AsyncStorage 기반 로컬 데이터베이스
│   └── storage.ts           # 로컬 파일 시스템 저장
├── types/                   # TypeScript 타입 정의
│   └── index.ts
├── app.json                 # Expo 설정
├── package.json
└── tsconfig.json
```

## 주요 기능

### ✅ 구현 완료
- 곡 목록 표시 및 추가
- 곡 상세 정보 보기
- 버전 목록 표시
- 대표 버전 설정
- 버전 삭제
- 플레이리스트 목록
- **녹음 기능 (expo-audio)**
- **오디오 재생 기능 (expo-audio)**
- 로컬 AsyncStorage 데이터 저장
- 로컬 파일 시스템 오디오 저장
- 네이티브 네비게이션

### 🚧 추가 개발 필요
- 플레이리스트 상세 기능
- 곡 검색 기능
- 데이터 백업/복원

## 로컬 저장소 구조

### AsyncStorage 키
- `@songs` - 모든 곡 정보 (JSON 배열)
- `@versions` - 모든 녹음 버전 (JSON 배열)
- `@playlists` - 모든 플레이리스트 (JSON 배열)
- `@playlistItems` - 플레이리스트 항목 (JSON 배열)

### 파일 시스템
- `{documentDirectory}/recordings/{songId}/{fileName}.m4a` - 녹음 파일
- iOS: `Paths.document` 사용
- Android: `Paths.document` 사용

## 오디오 기능

### 녹음
- `useAudioRecorder` hook 사용
- `RecordingPresets.HIGH_QUALITY` 프리셋
- 출력 형식: `.m4a`
- 권한 자동 요청

### 재생
- `useAudioPlayer` hook 사용
- 재생/일시정지/정지 컨트롤
- 프로그레스 바 및 시간 표시
- 로컬 파일에서 직접 재생

## 권한 설정

### iOS (app.json)
```json
"ios": {
  "infoPlist": {
    "NSMicrophoneUsageDescription": "녹음 기능을 사용하기 위해 마이크 접근 권한이 필요합니다."
  }
}
```

### Android (app.json)
```json
"android": {
  "permissions": ["android.permission.RECORD_AUDIO"]
}
```

## 빌드 및 배포

### iOS
```bash
# 개발 빌드
eas build --profile development --platform ios

# 프로덕션 빌드
eas build --profile production --platform ios
```

### Android
```bash
# 개발 빌드
eas build --profile development --platform android

# 프로덕션 빌드 (APK)
eas build --profile production --platform android
```

## 트러블슈팅

### 마이크 권한 오류
- iOS: Info.plist에 NSMicrophoneUsageDescription 추가됨
- Android: AndroidManifest.xml에 RECORD_AUDIO 권한 추가됨

### 데이터 초기화
```bash
# 앱 데이터 삭제 후 재시작
# iOS: 앱 삭제 후 재설치
# Android: 설정 → 앱 → 데이터 삭제
```

## 마이그레이션 노트

이 앱은 Firebase에서 로컬 저장소로 마이그레이션되었습니다:
- **Firestore** → **AsyncStorage**
- **Firebase Storage** → **expo-file-system**
- **expo-av** → **expo-audio** (최신 API)

모든 데이터는 디바이스 내부에 저장되며, 인터넷 연결이나 외부 서비스 없이도 완전히 동작합니다.

## 다음 단계

1. **플레이리스트 기능 확장**
   - 커스텀 플레이리스트 생성
   - 곡 추가/제거/순서 변경

2. **검색 및 필터**
   - 곡 제목/아티스트 검색
   - 별점별 필터링

3. **데이터 백업**
   - JSON 내보내기
   - 파일로 백업/복원

4. **UI/UX 개선**
   - 다크 모드
   - 커스텀 테마
   - 애니메이션

## 라이센스

Private
