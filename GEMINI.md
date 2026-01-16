# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

"방구석 플레이리스트" - 개인 노래방 플레이리스트 관리 React Native 애플리케이션입니다.

기술 스택:

- **React Native** with Expo
- **TypeScript** (Strict 모드)
- **AsyncStorage** - 로컬 데이터 저장
- **expo-file-system** - 로컬 파일 시스템 접근
- **React Navigation** (Native Stack Navigator)
- **expo-audio** - 오디오 녹음 및 재생

## 개발 명령어

```bash
# 의존성 설치
npm install

# Expo 개발 서버 실행
npm start

# iOS 시뮬레이터 실행
npm run ios

# Android 에뮬레이터 실행
npm run android

# 웹에서 실행 (테스트용)
npm run web
```

## 환경 변수 설정

이 프로젝트는 로컬 저장소를 사용하므로 별도의 환경 변수 설정이 필요하지 않습니다.

## 코딩 규칙

- 함수형 컴포넌트만 사용
- async/await 패턴 선호
- StyleSheet를 사용한 스타일링 (Tailwind 사용 안 함)
- 에러 핸들링 필수 (try-catch 사용)
- React Native 네이밍 규칙 준수
- 기능 구현 시, 현재 사용중인 라이브러리의 기능을 우선 탐색 후 없을 시 구현 (중요)

## 아키텍처

### 프로젝트 구조

```
playlist-app/
├── App.tsx                 # 앱 엔트리 포인트, Navigation 설정
├── app.json                # Expo 설정 (권한, 메타데이터)
├── screens/                # 화면 컴포넌트
│   ├── HomeScreen.tsx      # 홈 화면 (곡 목록)
│   ├── SongDetailScreen.tsx # 곡 상세 화면 (버전 관리, 녹음)
│   └── PlaylistsScreen.tsx # 플레이리스트 화면
├── components/             # 재사용 가능한 컴포넌트
│   ├── RecorderModal.tsx   # 녹음 모달
│   └── AudioPlayer.tsx     # 오디오 재생 컴포넌트
├── lib/                    # 라이브러리 및 유틸리티
│   ├── database.ts         # AsyncStorage 기반 로컬 데이터베이스 CRUD 함수
│   └── storage.ts          # 로컬 파일 시스템 저장
└── types/                  # TypeScript 타입 정의
    └── index.ts            # 공통 타입 (Song, Version, Playlist)
```

### Navigation 구조

- **React Navigation 6** (Native Stack Navigator 사용)
- 화면 타입: `RootStackParamList`
    - `Home`: 곡 목록 화면
    - `SongDetail`: 곡 상세 화면 (songId 파라미터 필요)
    - `Playlists`: 플레이리스트 화면

### 데이터 모델

#### Song (곡)

```typescript
interface Song {
  id: string;
  title: string;
  artist?: string;
  createdAt: Date;
  updatedAt: Date;
  defaultVersionId?: string; // 대표 버전
}
```

#### Version (녹음 버전)

```typescript
interface Version {
  id: string;
  songId: string;
  fileName: string;
  storageUrl: string; // 로컬 파일 시스템 URI
  rating: number; // 1-5 별점
  duration?: number;
  recordedAt: Date;
  memo?: string;
}
```

#### Playlist (플레이리스트)

```typescript
interface Playlist {
  id: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}
```

### 로컬 데이터 저장

#### AsyncStorage 키 구조

- `@songs`: 모든 곡 정보 (JSON 배열)
- `@versions`: 모든 녹음 버전 (JSON 배열)
- `@playlists`: 모든 플레이리스트 (JSON 배열)
- `@playlistItems`: 플레이리스트 항목 (JSON 배열)

#### 파일 시스템 구조 (expo-file-system)

- `{documentDirectory}/recordings/{songId}/{fileName}.m4a`: 녹음 파일
- iOS: `Paths.document` 사용
- Android: `Paths.document` 사용

### 스타일링

- React Native `StyleSheet` API 사용
- 인라인 스타일 최소화
- 색상 코드:
    - Primary: `#000` (검정색)
    - Background: `#fff` (흰색)
    - Text: `#111827`
    - Border: `#e5e7eb`
    - Yellow (별점): `#fbbf24`

### 오디오 기능

#### 녹음 (expo-audio)

- `useAudioRecorder` hook 사용
- `RecordingPresets.HIGH_QUALITY` 사용
- 출력 형식: `.m4a`
- 권한은 자동으로 요청됨

#### 재생 (expo-audio)

- `useAudioPlayer` hook 사용
- `player.playing`, `player.currentTime`, `player.duration` 속성으로 상태 추적
- Play/Pause/Stop 컨트롤 제공
- 프로그레스 바 및 시간 표시

### 권한 설정

#### iOS ([app.json](app.json))

```json
"ios": {
  "infoPlist": {
    "NSMicrophoneUsageDescription": "녹음 기능을 사용하기 위해 마이크 접근 권한이 필요합니다."
  }
}
```

#### Android ([app.json](app.json))

```json
"android": {
  "permissions": ["android.permission.RECORD_AUDIO"]
}
```

## 주요 기능

### 1. 곡 관리

- 곡 추가 (제목, 아티스트)
- 곡 삭제
- 곡 목록 조회 (최신순)
- 로컬 AsyncStorage에 저장

### 2. 버전 관리

- 곡별 여러 녹음 버전 저장
- 버전별 별점 (1-5)
- 버전별 메모
- 대표 버전 지정
- 버전 삭제

### 3. 녹음 기능

- 버튼 누르면 즉시 녹음 시작
- 실시간 녹음 시간 표시
- 녹음 중지 후 별점 및 메모 입력
- 로컬 파일 시스템에 자동 저장

### 4. 재생 기능

- 각 버전별 재생 버튼
- 재생/일시정지/정지 컨트롤
- 프로그레스 바
- 현재 시간 / 총 시간 표시
- 로컬 파일에서 직접 재생

### 5. 플레이리스트

- 기본 플레이리스트: 모든 곡의 대표 버전 자동 포함
- 커스텀 플레이리스트: 원하는 곡만 수동 추가

## 중요 사항

- **SafeAreaView** 필수 사용 (노치/상태바 대응)
- **FlatList** 사용 시 `keyExtractor` 필수 지정
- AsyncStorage 데이터는 JSON 직렬화/역직렬화 필요
    - 저장: `JSON.stringify(data)`
    - 읽기: `JSON.parse(jsonString)` + Date 변환
- 모든 비동기 작업에 에러 핸들링 추가
- 녹음 전 권한 체크 필수
- 컴포넌트 언마운트 시 Sound 객체 해제 (`sound.unloadAsync()`)
- 로컬 파일 시스템 사용 시 iOS와 Android 호환성 유의

## 데이터 마이그레이션

이 앱은 Firebase에서 로컬 저장소로 마이그레이션되었습니다:

- Firestore → AsyncStorage
- Firebase Storage → expo-file-system (Paths.document)
- 모든 데이터는 디바이스 내부에 저장됨

## 디버깅

```bash
# Expo 로그 확인
npm start

# React Native 디버거
- Expo Go 앱에서 흔들기 → "Debug Remote JS"

# 에러 로그 확인
npx react-native log-ios     # iOS
npx react-native log-android # Android
```

## 배포

```bash
# EAS Build로 앱 빌드
eas build --platform ios
eas build --platform android

# 앱 스토어 제출
eas submit --platform ios
eas submit --platform android
```

## 참고 문서

- [Expo 공식 문서](https://docs.expo.dev/)
- [React Navigation](https://reactnavigation.org/)
- [expo-audio 문서](https://docs.expo.dev/versions/latest/sdk/audio/)
- [expo-file-system 문서](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [AsyncStorage 문서](https://react-native-async-storage.github.io/async-storage/)
