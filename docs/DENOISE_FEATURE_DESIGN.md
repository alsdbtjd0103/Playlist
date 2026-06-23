# 녹음 잡음 제거 (온디바이스 DeepFilterNet 후처리) Implementation Plan

> 기준 검토: 대화 "노이즈 제거 기능 검토" → **B안 채택**(온디바이스 DNN 후처리 + 정제본을 새 버전 저장).
> 선행 패턴: [`superpowers/plans/2026-06-21-recording-trim-native.md`](superpowers/plans/2026-06-21-recording-trim-native.md)
> (네이티브 로컬 모듈 + dev build + 가용성 폴백 구조를 그대로 차용).
> 상태: **설계 확정본.** Phase 0(품질 게이트) 통과를 전제로 Task 1~6 진행.

**Goal:** 보관함의 녹음(Version)에서 배경 잡음을 줄인 **정제본을 새 Version으로 저장**한다(원본 보존).
트림과 동일한 "새 버전 저장 / 원본 덮어쓰기" UX. 네이티브 모듈이 없는 환경(Expo Go)에서는 메뉴를
**비활성**으로 graceful degrade.

**Architecture:** Expo 로컬 모듈(`modules/audio-denoise`)이 **DeepFilterNet3**를 래핑한다.
입력 m4a를 **48kHz mono PCM으로 디코드 → DFN 프레임 추론(10ms hop) → m4a 재인코딩**해 새 파일을 만든다.
JS 래퍼(`lib/nativeDenoise.ts`)가 모듈 가용성을 감지하고 `denoiseToFile(srcUri)`를 제공한다.
저장은 기존 `addVersion`/`saveAudioLocally`/`editedFrom` 흐름을 재사용.

**Tech Stack:** expo-modules-core(로컬 모듈), **libDeepFilter**(DeepFilterNet의 C API, Rust crate를
모바일 타깃으로 크로스 컴파일한 정적/공유 라이브러리 + 번들 모델 가중치), iOS Swift+AVFoundation
(AVAudioFile/AVAudioConverter), Android Kotlin+MediaCodec/MediaMuxer, EAS dev build.

## ⚠️ 잡음 제거가 트림과 다른 점 (난이도·리스크)
- 트림 = 컨테이너 무손실 복사(재인코딩 없음). **잡음 제거 = 디코드 + 모델 추론 + 재인코딩** → 본질적으로 무겁다.
- **Rust→모바일 크로스 컴파일** 필요(iOS `.a`, Android ABI별 `.so`) + **모델 가중치(~8MB) 번들** → 앱 용량 +10~20MB.
- 처리 시간(수 초)·배터리 소모 존재 → **오프라인 "정제 중…" 진행 UX** 필수(실시간 아님).
- **가창 품질 리스크:** DFN은 speech 기준 학습 → 지속음/비브라토 아티팩트, 반주 손상 가능.
  → 그래서 **Phase 0 품질 게이트를 네이티브 구현 전에 반드시 통과**시킨다(아래).

## Global Constraints
- 함수형 컴포넌트, async/await, try-catch. (CLAUDE.md)
- 네이티브 모듈은 **dev build 전용** — Expo Go 미지원. 미존재 시 메뉴 비활성/숨김.
- DFN 동작 표준: **48kHz mono**. 입력이 다르면 디코드 단계에서 리샘플/다운믹스.
- 새 파일은 기존 `storage.ts` 규칙과 동일 위치(`recordings/{songId}/`)에 저장.
- 원본 보존 우선: 덮어쓰기 모드라도 새 파일 버전을 만들고 원본 삭제는 분리(트림 Task5 한계와 동일 정책).
- 회귀 방지: 네이티브 미가용 시 기존 녹음/트림 동작·테스트가 그대로 유지.

---

## Phase 0 — 품질 게이트 (네이티브 구현 전, 비용 ↓ 먼저)

> 며칠짜리 네이티브 작업 전에 **모델이 내 노래를 안 망치는지** 몇 시간 만에 검증한다. 불합격이면 B안 중단/재검토.

- [ ] **Step 1: 실제 샘플 수집** — 노래방에서 옆방 소리 섞인 실제 녹음 5~10개(.m4a). 반주 있음/없음, 옆방 큼/작음 섞어서.
- [ ] **Step 2: 데스크톱 DFN 처리** — `deep-filter`(DeepFilterNet CLI)로 일괄 처리.
  ```bash
  pip install deepfilternet      # 또는 릴리스 바이너리 deep-filter
  deep-filter input.wav -o out/  # m4a는 ffmpeg로 wav 변환 후 처리
  ```
- [ ] **Step 3: A/B 평가(기준 명시)** — 원본 vs 정제본 청취. 합격 기준:
  - (a) **내 목소리·가창 손상 없음**(아티팩트/먹먹함 허용 범위) — 가장 중요
  - (b) 반주가 있으면 과도하게 뭉개지지 않음
  - (c) 옆방 소리가 **체감상 줄어듦**(완전 제거 아님 — 부분 완화면 합격)
- [ ] **Step 4: 판정 기록** — `docs/`에 샘플별 결과 요약. (a) 불합격이면 **B안 보류 → C안(Krisp BVC 서버 처리) 재검토**로 전환.

> Phase 0 통과 시에만 Task 1~6 착수.

---

### Task 1: Expo 로컬 모듈 스캐폴드 (`modules/audio-denoise`)

**Files:**
- Create: `modules/audio-denoise/expo-module.config.json`
- Create: `modules/audio-denoise/index.ts`
- Create: `modules/audio-denoise/src/AudioDenoiseModule.ts`

**Interfaces:**
- Produces: 네이티브 모듈 이름 `AudioDenoise`, JS export `getAudioDenoiseModule(): AudioDenoiseNative | null`

- [ ] **Step 1: 모듈 설정** — `expo-module.config.json`
```json
{
  "platforms": ["ios", "android"],
  "ios": { "modules": ["AudioDenoiseModule"] },
  "android": { "modules": ["expo.modules.audiodenoise.AudioDenoiseModule"] }
}
```

- [ ] **Step 2: JS 진입** — `src/AudioDenoiseModule.ts`
```typescript
import { requireNativeModule } from 'expo-modules-core';

export interface DenoiseResult {
  uri: string;          // 정제된 m4a 파일 uri
  waveform?: number[];  // 디코드 부산물로 뽑은 진폭 엔벨로프(선택)
}
export interface AudioDenoiseNative {
  // onProgress: 0~1 진행률 이벤트는 모듈 이벤트로 별도 emit(아래 네이티브 구현)
  denoise(srcUri: string): Promise<DenoiseResult>;
}

export function getAudioDenoiseModule(): AudioDenoiseNative | null {
  try {
    return requireNativeModule('AudioDenoise') as AudioDenoiseNative;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: index** — `index.ts`
```typescript
export { getAudioDenoiseModule } from './src/AudioDenoiseModule';
export type { AudioDenoiseNative, DenoiseResult } from './src/AudioDenoiseModule';
```

- [ ] **Step 4: 커밋** — `git commit -m "feat(native): audio-denoise 로컬 모듈 스캐폴드"`

---

### Task 2: DeepFilterNet 바이너리 + 모델 번들 (libDeepFilter)

> 모델 추론 엔진을 모바일에서 돌리는 핵심 단계. iOS/Android 공통 선행.

**산출물:**
- `modules/audio-denoise/ios/lib/libdf.a` (+ `df.h`) — Rust `deep-filter`(libDeepFilter) C API를 iOS용으로 빌드한 정적 라이브러리(aarch64-apple-ios, sim 포함 xcframework 권장).
- `modules/audio-denoise/android/src/main/jniLibs/{arm64-v8a,armeabi-v7a,x86_64}/libdf.so`
- `modules/audio-denoise/assets/DeepFilterNet3_onnx.tar.gz`(또는 모델 디렉터리) — 번들 가중치(~8MB).

- [ ] **Step 1: Rust 툴체인 + 타깃 추가**
```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim   # iOS
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android  # Android
cargo install cargo-ndk
```
- [ ] **Step 2: libDeepFilter 빌드** — DeepFilterNet 저장소의 `libDeepFilter`(C API) crate를 각 타깃으로 빌드해 위 산출물 생성. C API 시그니처는 헤더(`df.h`) 기준으로 확정:
  - `DFState* df_create(const char* model_path, float atten_lim_db)`
  - `usize df_get_frame_length(DFState*)`  // 48kHz hop(=480) 길이
  - `float df_process_frame(DFState*, float* input, float* output)`  // hop 단위 in-place 처리, 반환=local SNR
  - `void df_free(DFState*)`
- [ ] **Step 3: 모델 가중치 번들** — `assets/`에 모델 추가, 앱 시작/최초 사용 시 `documentDirectory`로 복사해 경로 확보.
- [ ] **Step 4: 커밋** — `git commit -m "build(native): libDeepFilter 모바일 바이너리 + 모델 번들"`

> 대안(리스크 분산): libDeepFilter 빌드가 막히면 ONNX Runtime + STFT/ERB/DF 후처리 직접 구현 경로가 있으나
> DSP 글루가 더 무겁다 → **libDeepFilter C API 우선**.

---

### Task 3: iOS 네이티브 구현 (디코드 → DFN → 인코딩)

**Files:**
- Create: `modules/audio-denoise/ios/AudioDenoiseModule.swift`
- Create: `modules/audio-denoise/ios/AudioDenoise.podspec` (vendored_libraries로 `lib/libdf.a` 포함)

- [ ] **Step 1: podspec** — `vendored_libraries`/`preserve_paths`로 정적 라이브러리·헤더 연결, `ExpoModulesCore` 의존.
- [ ] **Step 2: Swift 모듈** — `AudioDenoiseModule.swift` (요지)
```swift
import ExpoModulesCore
import AVFoundation

public class AudioDenoiseModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioDenoise")
    Events("onProgress")   // 0~1 진행률

    AsyncFunction("denoise") { (srcUri: String, promise: Promise) in
      do {
        let srcURL = URL(string: srcUri) ?? URL(fileURLWithPath: srcUri)
        // 1) 디코드 → 48kHz mono Float32 (AVAudioFile + AVAudioConverter)
        let pcm = try decodeTo48kMono(srcURL)            // [Float]
        // 2) DFN 프레임 추론 (hop = df_get_frame_length)
        let modelPath = try ensureModelCopied()
        let state = df_create(modelPath, 100.0)          // atten_lim_db: 0=최대제거, 클수록 약하게
        defer { df_free(state) }
        let hop = Int(df_get_frame_length(state))
        var out = [Float](repeating: 0, count: pcm.count)
        var i = 0
        while i + hop <= pcm.count {
          pcm.withUnsafeBufferPointer { inBuf in
            out.withUnsafeMutableBufferPointer { outBuf in
              _ = df_process_frame(state,
                UnsafeMutablePointer(mutating: inBuf.baseAddress!.advanced(by: i)),
                outBuf.baseAddress!.advanced(by: i))
            }
          }
          i += hop
          if (i / hop) % 50 == 0 { sendEvent("onProgress", ["progress": Double(i) / Double(pcm.count)]) }
        }
        // 3) 재인코딩 → m4a(AAC) (AVAudioFile writer, 48kHz mono)
        let outURL = FileManager.default.temporaryDirectory
          .appendingPathComponent("denoise_\(Int(Date().timeIntervalSince1970*1000)).m4a")
        try encodeM4A(out, to: outURL, sampleRate: 48000)
        // 4) 부산물 파형(다운샘플 진폭) 계산
        let waveform = downsampleEnvelope(out, buckets: 200)
        promise.resolve(["uri": outURL.absoluteString, "waveform": waveform])
      } catch {
        promise.reject("E_DENOISE", error.localizedDescription)
      }
    }
  }
}
```
> `decodeTo48kMono`/`encodeM4A`/`downsampleEnvelope`는 AVFoundation 헬퍼로 구현(별도 파일 분리 가능).

- [ ] **Step 3: 커밋** — `git commit -m "feat(native/ios): DeepFilterNet 디코드·추론·인코딩"`

---

### Task 4: Android 네이티브 구현 (MediaCodec ↔ DFN(JNI))

**Files:**
- Create: `modules/audio-denoise/android/build.gradle` (jniLibs 포함)
- Create: `modules/audio-denoise/android/src/main/AndroidManifest.xml`
- Create: `.../audiodenoise/AudioDenoiseModule.kt`
- Create: `.../audiodenoise/DfNative.kt` (JNI 바인딩: `external fun dfCreate/dfFrameLen/dfProcess/dfFree`)

- [ ] **Step 1: build.gradle** — `sourceSets.main.jniLibs.srcDirs += 'src/main/jniLibs'`, `expo-modules-core` 의존.
- [ ] **Step 2: JNI 바인딩** — `System.loadLibrary("df")` + `libDeepFilter` C 심볼을 외부 함수로 선언.
- [ ] **Step 3: Kotlin 모듈** — `AudioDenoiseModule.kt` (요지)
```kotlin
class AudioDenoiseModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioDenoise")
    Events("onProgress")

    AsyncFunction("denoise") { srcUri: String ->
      val ctx = appContext.reactContext ?: throw Exception("no context")
      // 1) MediaExtractor+MediaCodec 디코드 → PCM16 → Float, 48kHz mono 리샘플/다운믹스
      val pcm: FloatArray = decodeTo48kMono(srcUri)
      // 2) DFN 추론 (hop = dfFrameLen)
      val modelPath = ensureModelCopied(ctx)
      val state = DfNative.dfCreate(modelPath, 100.0f)
      val hop = DfNative.dfFrameLen(state)
      val out = FloatArray(pcm.size)
      var i = 0
      while (i + hop <= pcm.size) {
        DfNative.dfProcess(state, pcm, out, i, hop)
        i += hop
        if ((i / hop) % 50 == 0) sendEvent("onProgress", mapOf("progress" to i.toDouble() / pcm.size))
      }
      DfNative.dfFree(state)
      // 3) MediaCodec(AAC) + MediaMuxer 재인코딩 → m4a
      val outFile = File(ctx.cacheDir, "denoise_${System.currentTimeMillis()}.m4a")
      encodeM4A(out, outFile, 48000)
      // 4) 부산물 파형
      val waveform = downsampleEnvelope(out, 200)
      mapOf("uri" to Uri.fromFile(outFile).toString(), "waveform" to waveform.toList())
    }
  }
}
```
- [ ] **Step 4: 커밋** — `git commit -m "feat(native/android): DeepFilterNet 디코드·추론·인코딩"`

---

### Task 5: JS 래퍼 + 가용성 폴백 (`lib/nativeDenoise.ts`)

**Files:**
- Create: `lib/nativeDenoise.ts`
- Test: `__tests__/nativeDenoise.test.ts`

**Interfaces:**
- Consumes: `getAudioDenoiseModule`
- Produces:
  - `isNativeDenoiseAvailable(): boolean`
  - `denoiseToFile(srcUri, onProgress?): Promise<DenoiseResult>`

- [ ] **Step 1: 실패하는 테스트** — `__tests__/nativeDenoise.test.ts`
```typescript
jest.mock('../modules/audio-denoise', () => ({ getAudioDenoiseModule: jest.fn() }));
import { getAudioDenoiseModule } from '../modules/audio-denoise';
import { isNativeDenoiseAvailable, denoiseToFile } from '../lib/nativeDenoise';

describe('nativeDenoise', () => {
  it('모듈 없으면 미가용 + denoiseToFile throw', async () => {
    (getAudioDenoiseModule as jest.Mock).mockReturnValue(null);
    expect(isNativeDenoiseAvailable()).toBe(false);
    await expect(denoiseToFile('file:///a.m4a')).rejects.toThrow();
  });
  it('모듈 있으면 결과 반환', async () => {
    (getAudioDenoiseModule as jest.Mock).mockReturnValue({
      denoise: jest.fn(async () => ({ uri: 'file:///out.m4a', waveform: [0.1, 0.2] })),
    });
    expect(isNativeDenoiseAvailable()).toBe(true);
    expect((await denoiseToFile('file:///a.m4a')).uri).toBe('file:///out.m4a');
  });
});
```
- [ ] **Step 2: 실패 확인** — `npm test -- nativeDenoise` → FAIL
- [ ] **Step 3: 구현** — `lib/nativeDenoise.ts`
```typescript
import { getAudioDenoiseModule, DenoiseResult } from '../modules/audio-denoise';

export function isNativeDenoiseAvailable(): boolean {
  return getAudioDenoiseModule() !== null;
}
export async function denoiseToFile(srcUri: string): Promise<DenoiseResult> {
  const mod = getAudioDenoiseModule();
  if (!mod) throw new Error('잡음 제거 모듈을 사용할 수 없습니다.');
  return mod.denoise(srcUri);
}
```
> 진행률 구독(onProgress)은 `EventEmitter(mod)`로 화면에서 직접 붙인다(Task 6).

- [ ] **Step 4: 통과 확인** — `npm test -- nativeDenoise` → PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 잡음 제거 JS 래퍼 + 가용성 폴백"`

---

### Task 6: UI 연결 (버전 메뉴 → 처리 → A/B 미리듣기 → 저장)

**Files:**
- Modify: `screens/SongDetailScreen.tsx` (버전 메뉴에 `[잡음 제거]` 추가, 네이티브 가용 시에만 노출)
- Create: `screens/DenoiseScreen.tsx` (처리 진행 + 원본/정제본 A/B + 저장 두 버튼) — 트림 에디터 톤
- Modify: `lib/storage.ts` (정제 임시파일 영구 저장 — `saveAudioLocally` 재사용 래퍼)
- Modify: `types/index.ts` (`RootStackParamList`에 `Denoise: { versionId: string }`)
- Test: `__tests__/DenoiseScreen.test.tsx`

**흐름:**
```
버전 메뉴 [잡음 제거] → DenoiseScreen
  → denoiseToFile(version.storageUrl) (onProgress로 "정제 중 NN%")
  → 완료: 원본/정제본 A/B 미리듣기 (가창 손상 없는지 사용자가 직접 판단)  ← 품질 리스크 방어
  → [새 버전으로 저장](기본) / [원본 덮어쓰기](경고)
```

- [ ] **Step 1: storage 헬퍼** — `saveDenoisedFile(songId, tempUri) = saveAudioLocally(songId, tempUri)`
- [ ] **Step 2: 저장 로직** — 트림 Task5와 동일 패턴, `addVersion` 재사용
```typescript
const saveNew = async (result: DenoiseResult) => {
  const { fileName, localUri } = await saveDenoisedFile(version.songId, result.uri);
  await addVersion(
    version.songId, fileName, localUri, version.rating, version.duration, version.memo,
    { waveform: result.waveform ?? version.waveform, editedFrom: version.id }  // trim 없음(타이밍 불변)
  );
};
```
- [ ] **Step 3: 메뉴 노출 분기** — `isNativeDenoiseAvailable()` true일 때만 `[잡음 제거]` 표시(Expo Go 폴백).
- [ ] **Step 4: A/B 미리듣기 + 두 버튼 UI** — 저장 전 원본/정제본 토글 재생, `trim-save-*`와 동일하게 `denoise-save-new`/`denoise-save-overwrite` testID.
- [ ] **Step 5: 테스트** — 모듈 가용/미가용 분기, 저장 시 `addVersion` 호출, 진행률 표시.
- [ ] **Step 6: 커밋** — `git commit -m "feat: 잡음 제거 화면 + 새 버전 저장(가상 폴백·A/B 미리듣기)"`

---

### Task 7: dev build 검증 (수동, 실기기/시뮬레이터)

- [ ] **Step 1: prebuild + dev build** — `npx expo prebuild --clean` → `npx expo run:ios` / `run:android`
- [ ] **Step 2: 시나리오** — 옆방 소리 섞인 녹음 → [잡음 제거] → 진행률 표시 → A/B에서 정제 확인 → 새 버전 저장 → 재생 시 잡음 감소. iOS/Android 모두.
- [ ] **Step 3: 성능 점검** — 3분 녹음 처리 시간/메모리/앱 용량 증가 기록. 너무 느리면 atten_lim_db·모델 등 튜닝.
- [ ] **Step 4: 결과 기록** — PR/커밋에 요약.

---

## 구현 진행 현황 (2026-06-24)

| 단계 | 상태 | 비고 |
|---|---|---|
| Phase 0 품질 게이트 | 🟡 스크립트 제공 | `scripts/denoise-quality-test.sh` — 사용자가 실제 샘플로 직접 A/B |
| Task 1 모듈 스캐폴드 | ✅ 완료 | `modules/audio-denoise` (JS 진입/진행률 리스너) |
| Task 2 libDF 바이너리 | 🟠 코드/스크립트 완료, **바이너리 생성 필요** | `build-libdf.sh`+`NATIVE_BINARIES.md` — Rust 빌드 환경에서 1회 실행 |
| Task 3 iOS 네이티브 | ✅ 소스 완료 | `ios/AudioDenoiseModule.swift`(+podspec/modulemap) — dev build 시 컴파일 |
| Task 4 Android 네이티브 | ✅ 소스 완료 | `android/.../AudioDenoiseModule.kt`+`DfNative.kt` — JNI shim 필요(주석) |
| Task 5 JS 래퍼 | ✅ 완료·검증 | `lib/nativeDenoise.ts`, Jest 4/4 green |
| Task 6 UI 연결 | ✅ 완료·검증 | `DenoiseScreen`+메뉴+네비, Jest 3/3, 전체 83/83 green |
| Task 7 dev build 검증 | ⬜ 미착수 | 실기기/시뮬레이터 필요(헤드리스 불가) |

**남은 일(개발자 빌드 환경 필수):**
1. Phase 0 품질 게이트 실행 → 가창 손상 없는지 A/B 판정(불합격 시 C안 전환).
2. `build-libdf.sh`로 libDeepFilter 바이너리 생성 + 모델 가중치 `assets/` 배치 (Android은 JNI shim 포함).
3. `npx expo prebuild --clean && expo run:ios|android` 후 Task 7 수동 시나리오 검증.

> JS 계층(Task 5·6)은 Jest로 완전 검증됨. 네이티브(Task 2~4)·기기 검증(Task 7)만 빌드 환경에서 남음.

## Self-Review / 한계·리스크
- **가창 품질이 최대 리스크** → Phase 0 게이트 + 앱 내 A/B 미리듣기로 이중 방어. 사용자가 정제본을 거부하면 저장 안 함.
- **앱 용량 +10~20MB**(모델·바이너리), 처리 수 초·배터리 → "정제 중" UX로 흡수.
- **옆방 목소리는 부분 완화**(완전 제거 아님). 더 강하게 필요하면 C안(Krisp BVC, [`PHASE2_BACKEND_DESIGN.md`] 백엔드에서 업로드 시 처리)로 확장.
- **회귀:** 네이티브 미가용 시 메뉴만 숨고 기존 녹음/트림/재생은 불변.
- **타입 일관성:** `getAudioDenoiseModule()/AudioDenoiseNative.denoise`, `isNativeDenoiseAvailable()/denoiseToFile()`, `addVersion(...editedFrom)`(트림과 동일 시그니처) — 일치.
- **헤드리스 한계:** Task 2~3,7은 dev build/실기기 필요(Jest 불가). JS 래퍼(Task5)·화면 분기(Task6)만 Jest 커버.
</content>
