# 백업/복원 (설정 탭 + 내보내기/가져오기) Design

> 상태: **설계 확정본.** 사용자 승인("알아서 자동진행해") 하에 결정 사항을 확정함.
> 동기: 처음엔 "preview 빌드의 녹음을 맥으로 빼내기"였으나, **백업/복원 정식 기능**으로 확장.
> 선행 패턴: 버전 단일 공유(`SongDetailScreen` ⋯ 메뉴 `공유/내보내기`, expo-sharing) — 이미 추가됨. 이 기능은 그와 별개로 **구조화된 번들(메타데이터+오디오)** 을 다룬다.

## Goal

앱의 데이터(곡·버전·메모·별점·플레이리스트)와 오디오 파일을 **하나의 zip 백업**으로 내보내고,
그 zip을 다시 **앱으로 복원(import)** 한다. 기기 이전·데이터 보존·외부 추출을 모두 만족.

## 용도/정책 (확정)

- **용도:** 백업/복원. 내보낸 zip은 다시 import 가능하도록 구조화.
- **복원 충돌 정책:** **id 기준 병합(merge), 기존 데이터 유지·중복 건너뜀(idempotent).** 기존 데이터를 절대 파괴하지 않음. (덮어쓰기/전체 교체 모드는 YAGNI — 이번 범위 제외)
- **오디오:** 백업에는 항상 오디오 파일 포함.
- 네이티브 모듈(zip/document-picker) 미가용 환경(Expo Go)에서는 해당 동작이 graceful하게 실패 안내(앱 영향 없음).

## Global Constraints (CLAUDE.md)

- 함수형 컴포넌트, async/await, try-catch 에러 핸들링 필수.
- StyleSheet 스타일링, 기존 테마 토큰(`useTheme`/`ColorTokens`) 사용.
- AsyncStorage 직렬화 규칙 준수(저장 JSON, 읽기 시 Date 변환). import는 **on-disk 원시 JSON(ISO 날짜 문자열) 레벨**에서 병합한다.
- 외부 모듈은 `jest.setup.js`/테스트에서 목 처리. 네이티브 zip/document-picker는 헤드리스 불가 → 코어 로직만 Jest, 실제 동작은 dev build 수동 검증.

---

## Architecture

```
설정 탭(SettingsTab) ──> SettingsScreen
                          ├─ [내보내기]  ─> ExportScreen (4모드)
                          │      └─ buildBackup(selection) ─> zipUri ─> Sharing.shareAsync(zip)
                          └─ [가져오기]  ─> DocumentPicker(zip) ─> restoreBackup(zipUri) ─> 요약 Alert

lib/backup.ts (코어, 테스트 대상)
  - buildBackup(selection): 선택 범위의 곡/버전/플레이리스트 수집 → manifest.json + audio/ 스테이징 → zip → uri
  - restoreBackup(zipUri): unzip → manifest 검증 → 오디오 복사 → DB 병합(id 기준) → 요약 반환
lib/database.ts (확장)
  - exportAllRaw() / 범위별 수집 helper, mergeImportRaw(data) (id 기준 upsert-skip)
```

### 데이터 흐름 (export)

1. 선택 범위에 따라 `songs[] / versions[] / playlists[] / playlistItems[]` 수집.
2. 임시 스테이징 디렉터리에 `manifest.json` + `audio/{versionId}.m4a`(원본 복사) 작성.
   - manifest의 version 레코드는 `storageUrl` → `audio/{versionId}.m4a` **상대 참조**로 치환.
3. `react-native-zip-archive`의 `zip(stagingDir, destZip)` → `plilog-backup-YYYYMMDD-HHmm.zip`.
4. `Sharing.shareAsync(zipUri, { mimeType: 'application/zip' })` → 사용자가 Drive/메일 등으로 전송.

### 데이터 흐름 (import)

1. `expo-document-picker`로 `.zip` 선택.
2. `unzip(zipUri, tempDir)` → `tempDir/manifest.json` 읽기 → `schemaVersion` 검증(미래 버전이면 안내 후 중단).
3. version별 `audio/{versionId}.m4a` → `saveAudioLocally(songId, fileUri)`로 앱 영구 위치 복사, `storageUrl`을 새 localUri로 치환.
4. `mergeImportRaw({songs,versions,playlists,playlistItems})` — 각 컬렉션을 id 기준 병합(이미 있으면 skip).
5. 대표 플레이리스트 동기화(`syncDefaultPlaylist`) 호출 후 요약 Alert: "곡 N · 버전 M 복원 (중복 K 건너뜀)".

---

## 백업 번들 포맷

```
plilog-backup-YYYYMMDD-HHmm.zip
├── manifest.json
└── audio/
    └── {versionId}.m4a        # 평탄 저장(songId 폴더 없이 versionId 키)
```

`manifest.json`:
```json
{
  "schemaVersion": 1,
  "app": "plilog",
  "exportedAt": "2026-06-27T12:00:00.000Z",
  "exportType": "all | song | playlist | songs",
  "songs":         [ /* Song 레코드 원형(ISO 날짜) */ ],
  "versions":      [ /* Version 레코드, storageUrl="audio/{id}.m4a" */ ],
  "playlists":     [ /* all/playlist 일 때만 */ ],
  "playlistItems": [ /* all/playlist 일 때만 */ ]
}
```

- 메모/별점은 Version 레코드 필드라 자동 포함.
- 부분 내보내기(song/songs)는 `playlists/playlistItems` 비움.
- 플레이리스트 내보내기는: 해당 playlist + 그 playlistItems + 참조된 versions + 그 versions의 부모 songs를 포함(복원 시 재구성 가능).

---

## 화면/컴포넌트

### 1. 설정 탭 (App.tsx)
- `Tab.Navigator`에 `SettingsTab`(3번째) 추가 → `SettingsStack`(SettingsScreen + ExportScreen).
- `CustomTabBar` 아이콘 분기를 맵으로 변경: `HomeTab→musical-notes`, `PlaylistTab→albums`, `SettingsTab→settings-outline`. 라벨 `설정`.
- `RootStackParamList`에 `Settings: undefined`, `Export: undefined` 추가.

### 2. SettingsScreen (`screens/SettingsScreen.tsx`)
- `ScreenHeader` "설정". 섹션: **백업 / 복원**.
  - 행 `내보내기(백업 만들기)` → Export 화면.
  - 행 `가져오기(백업 복원)` → 문서 선택 → `restoreBackup`. 처리 중 인디케이터, 완료/실패 Alert.
- (확장성: 추후 테마 등 다른 설정 섹션 추가 가능하나 이번 범위 아님.)

### 3. ExportScreen (`screens/ExportScreen.tsx`)
4가지 모드:
1. **전체 백업** — 곡/버전/플레이리스트/플레이리스트항목 전부 + 모든 오디오.
2. **노래 선택 백업** — 곡 단일 선택(리스트) → 그 곡 + 버전들.
3. **플레이리스트 선택 백업** — 플레이리스트 단일 선택 → 플레이리스트 + 멤버 버전/부모 곡.
4. **곡 직접 선택 백업** — 멀티셀렉트(체크박스, `PlaylistDetailScreen`의 `Set<string>`+체크박스 패턴 재사용) → 선택 곡들 + 버전들.

각 모드 실행 → `buildBackup(selection)` → 진행 인디케이터 → `Sharing.shareAsync`.

### 4. lib/backup.ts (코어)
- `type BackupSelection = {type:'all'} | {type:'song'; songId} | {type:'playlist'; playlistId} | {type:'songs'; songIds[]}`
- `buildBackup(sel): Promise<{uri:string; counts:{songs,versions}}>`
- `restoreBackup(zipUri): Promise<{added:{songs,versions,playlists}; skipped:{songs,versions,playlists}}>`
- 검증: manifest 없음/`schemaVersion` 미래값/오디오 누락 시 명확한 throw.

---

## 라이브러리

- **react-native-zip-archive** — `zip(dir, dest)` / `unzip(src, dir)`. 파일 기반(대용량 오디오 OK). 네이티브(autolink).
- **expo-document-picker** — import 시 zip 선택.
- **expo-sharing** — 이미 설치(14.0.8). export 공유.
- 네이티브 추가분은 `audio-denoise`와 달리 **autolinking 제외 불필요**(바이너리 자체 포함 라이브러리) → dev build/preview 재빌드로 활성.

## 에러 핸들링

- 모든 비동기에 try-catch. 사용자 메시지는 한국어 Alert.
- export: 빈 선택/오디오 파일 없음 → 안내. 임시 스테이징/zip 실패 → 정리 후 실패 Alert.
- import: 잘못된 zip/manifest, schema 불일치, 오디오 누락 → 부분 복원 대신 명확한 실패 안내. 가용 모듈 없으면 "이 빌드에서 지원 안 됨".
- 임시 디렉터리는 finally에서 정리.

## 테스트

- `__tests__/backup.test.ts` — `buildBackup` manifest 구성(범위별 곡/버전/플레이리스트 포함 여부, storageUrl 치환), `restoreBackup` 병합(중복 skip·신규 add 카운트), schema 검증 실패. AsyncStorage·zip·fs 목.
- `__tests__/SettingsScreen.test.tsx` — 행 렌더/네비게이션, import 트리거.
- `__tests__/ExportScreen.test.tsx` — 4모드 노출, 멀티셀렉트 토글, buildBackup 호출.
- 네이티브 zip/unzip/document-picker 실제 동작은 **dev build 수동 검증**(헤드리스 불가) — 시나리오: 전체 백업→공유→다른 데이터 상태에서 가져오기→복원 확인.

## Self-Review / 한계·리스크

- **대용량:** 전체 백업이 수백 MB일 수 있음 → 파일 기반 zip으로 메모리 안전. 진행 인디케이터로 UX 흡수.
- **충돌:** id 병합·skip이라 재import 안전(중복 안 생김). 단 "수정된 메모를 덮어쓰기"는 불가(YAGNI) — 필요 시 후속.
- **부분 백업 일관성:** 플레이리스트/곡 백업은 참조 무결성(부모 곡 포함) 보장.
- **회귀:** 설정 탭/백업은 기존 화면에 비침투적. 기존 테스트 유지. 탭 1개 추가만 App.tsx 영향.
- **헤드리스 한계:** 네이티브 zip/picker는 Jest 불가 → 코어 로직만 커버, 기기 검증 별도.
</content>
</invoke>
