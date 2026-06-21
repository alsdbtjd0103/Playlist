# 녹음 트리밍 (2단계: 네이티브 실제 자르기) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **선행 조건:** `2026-06-21-recording-trim-virtual.md`(가상 트림) 완료 상태에서 시작. 이 단계는
> **네이티브 모듈 + dev build**가 필요하며 **Jest 헤드리스로 검증 불가**(실기기/시뮬레이터 필요).

**Goal:** 저장 시 m4a를 **무손실로 실제 잘라** 새 파일을 만든다(재인코딩 없음). 네이티브 모듈이 없는 환경(Expo Go 등)에서는 가상 트림으로 graceful fallback.

**Architecture:** Expo 로컬 모듈(`modules/audio-trim`)로 iOS `AVAssetExportSession`(passthrough), Android `MediaExtractor`+`MediaMuxer`를 래핑한다. JS 래퍼(`lib/nativeTrim.ts`)가 모듈 가용성을 감지하고 `trimAudio(srcUri, start, end)`를 제공한다. `TrimEditorScreen` 저장 로직이 가용 시 실제 파일 생성 → 새 `storageUrl`로 버전 저장, 불가 시 기존 가상 트림 경로 유지.

**Tech Stack:** expo-modules-core(로컬 모듈), Swift(AVFoundation), Kotlin(MediaExtractor/MediaMuxer), EAS dev build.

## Global Constraints

- 함수형 컴포넌트, async/await, try-catch. (CLAUDE.md)
- 네이티브 모듈은 **dev build 전용** — Expo Go 미지원. 미존재 시 가상 트림으로 degrade.
- 무손실 우선: 재인코딩 없이 컨테이너 구간 복사(AAC 프레임 경계 ~21ms 허용).
- 새 파일은 기존 `storage.ts` 규칙과 동일 위치(`recordings/{songId}/`)에 저장.
- 회귀 방지: 네이티브 미가용 시 Plan 2의 동작/테스트가 그대로 유지되어야 함.

---

### Task 1: Expo 로컬 모듈 스캐폴드 (`modules/audio-trim`)

**Files:**
- Create: `modules/audio-trim/expo-module.config.json`
- Create: `modules/audio-trim/index.ts`
- Create: `modules/audio-trim/src/AudioTrimModule.ts`
- Modify: `package.json`(필요 시 `expo-modules-core` 존재 확인 — expo SDK에 포함)

**Interfaces:**
- Produces: 네이티브 모듈 이름 `AudioTrim`, JS export `trimAudioNative(srcUri: string, startSec: number, endSec: number): Promise<string>`

- [ ] **Step 1: 모듈 설정** — `modules/audio-trim/expo-module.config.json`

```json
{
  "platforms": ["ios", "android"],
  "ios": { "modules": ["AudioTrimModule"] },
  "android": { "modules": ["expo.modules.audiotrim.AudioTrimModule"] }
}
```

- [ ] **Step 2: JS 진입** — `modules/audio-trim/src/AudioTrimModule.ts`

```typescript
import { requireNativeModule } from 'expo-modules-core';

// 네이티브 모듈이 없으면 requireNativeModule이 throw → 래퍼에서 try-catch로 가용성 판단
export interface AudioTrimNative {
  trim(srcUri: string, startSec: number, endSec: number): Promise<string>;
}

export function getAudioTrimModule(): AudioTrimNative | null {
  try {
    return requireNativeModule('AudioTrim') as AudioTrimNative;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: index** — `modules/audio-trim/index.ts`

```typescript
export { getAudioTrimModule } from './src/AudioTrimModule';
export type { AudioTrimNative } from './src/AudioTrimModule';
```

- [ ] **Step 4: 커밋**

```bash
git add modules/audio-trim
git commit -m "feat(native): audio-trim 로컬 모듈 스캐폴드"
```

---

### Task 2: iOS 네이티브 구현 (AVAssetExportSession passthrough)

**Files:**
- Create: `modules/audio-trim/ios/AudioTrimModule.swift`
- Create: `modules/audio-trim/ios/AudioTrim.podspec`

- [ ] **Step 1: podspec** — `modules/audio-trim/ios/AudioTrim.podspec`

```ruby
Pod::Spec.new do |s|
  s.name           = 'AudioTrim'
  s.version        = '1.0.0'
  s.summary        = '무손실 m4a 트림(AVAssetExportSession passthrough)'
  s.author         = ''
  s.homepage       = 'https://example.com'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.{h,m,swift}'
end
```

- [ ] **Step 2: Swift 모듈** — `modules/audio-trim/ios/AudioTrimModule.swift`

```swift
import ExpoModulesCore
import AVFoundation

public class AudioTrimModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioTrim")

    AsyncFunction("trim") { (srcUri: String, startSec: Double, endSec: Double, promise: Promise) in
      let srcURL = URL(string: srcUri) ?? URL(fileURLWithPath: srcUri)
      let asset = AVURLAsset(url: srcURL)

      let outName = "trim_\(Int(Date().timeIntervalSince1970 * 1000)).m4a"
      let outURL = FileManager.default.temporaryDirectory.appendingPathComponent(outName)
      try? FileManager.default.removeItem(at: outURL)

      guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetPassthrough) else {
        promise.reject("E_EXPORT", "AVAssetExportSession 생성 실패")
        return
      }
      export.outputURL = outURL
      export.outputFileType = .m4a
      let timescale: CMTimeScale = 600
      let start = CMTime(seconds: max(0, startSec), preferredTimescale: timescale)
      let end = CMTime(seconds: endSec, preferredTimescale: timescale)
      export.timeRange = CMTimeRange(start: start, end: end)

      export.exportAsynchronously {
        switch export.status {
        case .completed: promise.resolve(outURL.absoluteString)
        case .failed, .cancelled:
          promise.reject("E_EXPORT", export.error?.localizedDescription ?? "트림 실패")
        default: break
        }
      }
    }
  }
}
```

- [ ] **Step 3: 커밋**

```bash
git add modules/audio-trim/ios
git commit -m "feat(native/ios): AVAssetExportSession 무손실 트림"
```

---

### Task 3: Android 네이티브 구현 (MediaExtractor + MediaMuxer)

**Files:**
- Create: `modules/audio-trim/android/build.gradle`
- Create: `modules/audio-trim/android/src/main/AndroidManifest.xml`
- Create: `modules/audio-trim/android/src/main/java/expo/modules/audiotrim/AudioTrimModule.kt`

- [ ] **Step 1: build.gradle** — `modules/audio-trim/android/build.gradle`

```gradle
apply plugin: 'com.android.library'
apply plugin: 'kotlin-android'

group = 'expo.modules.audiotrim'
version = '1.0.0'

android {
  namespace = "expo.modules.audiotrim"
  compileSdkVersion safeExtGet("compileSdkVersion", 34)
  defaultConfig { minSdkVersion safeExtGet("minSdkVersion", 24) }
  kotlinOptions { jvmTarget = "17" }
}

dependencies { implementation project(':expo-modules-core') }

def safeExtGet(prop, fallback) {
  rootProject.ext.has(prop) ? rootProject.ext.get(prop) : fallback
}
```

- [ ] **Step 2: Manifest** — `modules/audio-trim/android/src/main/AndroidManifest.xml`

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android" />
```

- [ ] **Step 3: Kotlin 모듈** — `.../audiotrim/AudioTrimModule.kt`

```kotlin
package expo.modules.audiotrim

import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaMuxer
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.nio.ByteBuffer

class AudioTrimModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioTrim")

    AsyncFunction("trim") { srcUri: String, startSec: Double, endSec: Double ->
      val context = appContext.reactContext ?: throw Exception("no context")
      val srcPath = Uri.parse(srcUri).path ?: srcUri

      val extractor = MediaExtractor()
      extractor.setDataSource(srcPath)

      // 오디오 트랙 선택
      var audioTrack = -1
      var format: android.media.MediaFormat? = null
      for (i in 0 until extractor.trackCount) {
        val f = extractor.getTrackFormat(i)
        if (f.getString(android.media.MediaFormat.KEY_MIME)?.startsWith("audio/") == true) {
          audioTrack = i; format = f; break
        }
      }
      if (audioTrack < 0 || format == null) { extractor.release(); throw Exception("오디오 트랙 없음") }
      extractor.selectTrack(audioTrack)

      val outFile = File(context.cacheDir, "trim_${System.currentTimeMillis()}.m4a")
      val muxer = MediaMuxer(outFile.absolutePath, MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4)
      val outTrack = muxer.addTrack(format)
      muxer.start()

      val startUs = (startSec * 1_000_000).toLong()
      val endUs = (endSec * 1_000_000).toLong()
      extractor.seekTo(startUs, MediaExtractor.SEEK_TO_PREVIOUS_SYNC)

      val maxChunk = 256 * 1024
      val buffer = ByteBuffer.allocate(maxChunk)
      val info = MediaCodec.BufferInfo()
      try {
        while (true) {
          val sampleTime = extractor.sampleTime
          if (sampleTime < 0 || sampleTime > endUs) break
          val size = extractor.readSampleData(buffer, 0)
          if (size < 0) break
          info.offset = 0
          info.size = size
          info.presentationTimeUs = sampleTime - startUs
          info.flags = extractor.sampleFlags
          muxer.writeSampleData(outTrack, buffer, info)
          extractor.advance()
        }
      } finally {
        muxer.stop(); muxer.release(); extractor.release()
      }
      Uri.fromFile(outFile).toString()
    }
  }
}
```

- [ ] **Step 4: 커밋**

```bash
git add modules/audio-trim/android
git commit -m "feat(native/android): MediaExtractor+MediaMuxer 무손실 트림"
```

---

### Task 4: JS 래퍼 + 가용성 폴백 (`lib/nativeTrim.ts`)

**Files:**
- Create: `lib/nativeTrim.ts`
- Test: `__tests__/nativeTrim.test.ts`

**Interfaces:**
- Consumes: `getAudioTrimModule` (modules/audio-trim)
- Produces:
  - `isNativeTrimAvailable(): boolean`
  - `trimToFile(srcUri: string, range: TrimRange): Promise<string>` — 새 파일 uri 반환

- [ ] **Step 1: 실패하는 테스트** — `__tests__/nativeTrim.test.ts`

```typescript
jest.mock('../modules/audio-trim', () => ({ getAudioTrimModule: jest.fn() }));
import { getAudioTrimModule } from '../modules/audio-trim';
import { isNativeTrimAvailable, trimToFile } from '../lib/nativeTrim';

describe('nativeTrim', () => {
  it('모듈 없으면 미가용 + trimToFile은 throw', async () => {
    (getAudioTrimModule as jest.Mock).mockReturnValue(null);
    expect(isNativeTrimAvailable()).toBe(false);
    await expect(trimToFile('file:///a.m4a', { start: 1, end: 5 })).rejects.toThrow();
  });

  it('모듈 있으면 trim 호출 결과 uri 반환', async () => {
    (getAudioTrimModule as jest.Mock).mockReturnValue({
      trim: jest.fn(async () => 'file:///out.m4a'),
    });
    expect(isNativeTrimAvailable()).toBe(true);
    expect(await trimToFile('file:///a.m4a', { start: 1, end: 5 })).toBe('file:///out.m4a');
  });
});
```

- [ ] **Step 2: 실패 확인** — Run: `npm test -- nativeTrim` · Expected: FAIL (모듈 없음)

- [ ] **Step 3: 구현** — `lib/nativeTrim.ts`

```typescript
import { getAudioTrimModule } from '../modules/audio-trim';
import { TrimRange } from './trim';

export function isNativeTrimAvailable(): boolean {
  return getAudioTrimModule() !== null;
}

export async function trimToFile(srcUri: string, range: TrimRange): Promise<string> {
  const mod = getAudioTrimModule();
  if (!mod) throw new Error('네이티브 트림 모듈을 사용할 수 없습니다.');
  return mod.trim(srcUri, range.start, range.end);
}
```

- [ ] **Step 4: 통과 확인** — Run: `npm test -- nativeTrim` · Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add lib/nativeTrim.ts __tests__/nativeTrim.test.ts
git commit -m "feat: 네이티브 트림 JS 래퍼 + 가용성 폴백"
```

---

### Task 5: 에디터 저장에 실제 자르기 연결

**Files:**
- Modify: `screens/TrimEditorScreen.tsx` (`finish` 로직)
- Modify: `lib/storage.ts` (임시 파일을 영구 위치로 이동하는 헬퍼 추가)
- Test: `__tests__/TrimEditorScreen.test.tsx` (네이티브 가용 분기 추가)

**Interfaces:**
- Consumes: `isNativeTrimAvailable`, `trimToFile` (lib/nativeTrim), `saveTrimmedFile`(신규 storage)
- Produces: `saveTrimmedFile(songId: string, tempUri: string): Promise<{ fileName: string; localUri: string }>`

- [ ] **Step 1: storage 헬퍼** — `lib/storage.ts`에 추가

```typescript
export const saveTrimmedFile = async (
  songId: string,
  tempUri: string
): Promise<{ fileName: string; localUri: string }> => {
  return saveAudioLocally(songId, tempUri); // 동일 규칙으로 recordings/{songId}/에 복사
};
```

- [ ] **Step 2: 실패하는 테스트(분기)** — `__tests__/TrimEditorScreen.test.tsx`에 추가

```typescript
jest.mock('../lib/nativeTrim', () => ({
  isNativeTrimAvailable: jest.fn(() => true),
  trimToFile: jest.fn(async () => 'file:///tmp/out.m4a'),
}));
jest.mock('../lib/storage', () => ({
  saveTrimmedFile: jest.fn(async () => ({ fileName: 'cut.m4a', localUri: 'file:///rec/cut.m4a' })),
}));
// addVersion 목 추가
jest.mock('../lib/database', () => ({
  getVersion: jest.fn(),
  applyTrimToVersion: jest.fn(async () => {}),
  createTrimmedVersion: jest.fn(async () => 'new-v'),
  addVersion: jest.fn(async () => 'native-v'),
}));
import { trimToFile } from '../lib/nativeTrim';
import { addVersion } from '../lib/database';

it('네이티브 가용 시 새 버전 저장은 실제 파일을 만들어 addVersion', async () => {
  // getVersion mock은 기존 beforeEach 재사용
  const r = render(<TrimEditorScreen navigation={nav} route={route} />);
  await waitFor(() => r.getByTestId('trim-save-button'));
  await act(async () => { fireEvent.press(r.getByTestId('trim-save-button')); });
  // 저장 모드 Alert에서 '새 버전으로 저장' 선택 경로를 직접 호출하도록 finish('new') 분기 검증
  await waitFor(() => expect(trimToFile).toHaveBeenCalled());
  expect(addVersion).toHaveBeenCalled();
});
```

> 참고: Alert 버튼 콜백은 테스트에서 직접 누르기 어렵다. `finish(mode)`를 컴포넌트 외부에서
> 호출 가능한 형태로 두거나, 저장 버튼이 곧장 기본 모드(`new`)를 실행하도록 1차 분기하고
> 모드 선택은 별도 버튼(`trim-save-new`/`trim-save-overwrite`)으로 노출해 테스트한다.
> → **구현 시 저장 UI를 두 버튼(새 버전/덮어쓰기)으로 변경**하여 테스트 가능성을 확보한다.

- [ ] **Step 3: 저장 UI를 두 버튼으로 변경 + finish에 네이티브 분기** — `screens/TrimEditorScreen.tsx`

`handleSave`(단일 버튼+Alert)를 제거하고 하단에 두 버튼 노출:

```tsx
import { isNativeTrimAvailable, trimToFile } from '../lib/nativeTrim';
import { addVersion } from '../lib/database';
import { saveTrimmedFile } from '../lib/storage';
// ...
const finish = async (mode: 'new' | 'overwrite') => {
  if (!version) return;
  setSaving(true);
  try {
    const safe = clampTrimRange(range, duration);
    if (isNativeTrimAvailable()) {
      // 실제 무손실 자르기 → 새 파일
      const tempUri = await trimToFile(version.storageUrl, safe);
      const { fileName, localUri } = await saveTrimmedFile(version.songId, tempUri);
      // 실제로 잘렸으므로 trim 메타데이터 없이 새 파일로 새 버전 생성
      await addVersion(version.songId, fileName, localUri, version.rating, trimmedDuration(safe), version.memo, {
        waveform: version.waveform, editedFrom: version.id,
      });
      // overwrite 모드라도 안전하게 새 파일 버전으로 둔다(원본 파일 보존). 필요 시 원본 버전 삭제는 별도.
    } else {
      // 가상 트림(Plan 2 경로)
      if (mode === 'overwrite') await applyTrimToVersion(version.id, safe);
      else await createTrimmedVersion(version.id, safe);
    }
    navigation.goBack();
  } catch {
    Alert.alert('오류', '저장에 실패했습니다.');
  } finally { setSaving(false); }
};
```

하단 버튼 영역:

```tsx
<View style={styles.saveRow}>
  <TouchableOpacity style={[styles.saveButton, styles.saveGhost]} onPress={() => confirmOverwrite()} disabled={saving} testID="trim-save-overwrite">
    <Text style={styles.saveGhostText}>원본 덮어쓰기</Text>
  </TouchableOpacity>
  <TouchableOpacity style={[styles.saveButton, saving && styles.disabled]} onPress={() => finish('new')} disabled={saving} testID="trim-save-button">
    {saving ? <ActivityIndicator color={colors.background} /> : <Text style={styles.saveText}>새 버전으로 저장</Text>}
  </TouchableOpacity>
</View>
```

`confirmOverwrite`는 경고 Alert 후 `finish('overwrite')` 호출:

```tsx
const confirmOverwrite = () => {
  Alert.alert('원본 덮어쓰기', '되돌릴 수 없어요. 계속할까요?', [
    { text: '취소', style: 'cancel' },
    { text: '덮어쓰기', style: 'destructive', onPress: () => finish('overwrite') },
  ]);
};
```

스타일 추가: `saveRow`(flexDirection row, gap), `saveGhost`/`saveGhostText`(surfaceLight 배경).

- [ ] **Step 4: 통과 확인** — Run: `npm test -- TrimEditorScreen` · Expected: PASS(가상 분기 기존 테스트 + 네이티브 분기 신규)

- [ ] **Step 5: 커밋**

```bash
git add screens/TrimEditorScreen.tsx lib/storage.ts __tests__/TrimEditorScreen.test.tsx
git commit -m "feat: 트림 저장에 네이티브 실제 자르기 연결(+가상 폴백, 두 버튼 UI)"
```

---

### Task 6: dev build 검증(수동, 실기기/시뮬레이터)

**Files:** 없음(빌드/검증 단계)

- [ ] **Step 1: prebuild + dev build** — Run:

```bash
npx expo prebuild --clean
# iOS 시뮬레이터
npx expo run:ios
# 또는 Android
npx expo run:android
```
Expected: 빌드 성공, 앱 실행.

- [ ] **Step 2: 수동 시나리오 확인**
  - 녹음 → 버전 메뉴 [구간 편집] → 핸들로 구간 지정 → [구간 미리듣기]가 그 구간만 재생 후 정지.
  - [새 버전으로 저장] → 새 버전 생성, 재생하면 **실제로 잘린 길이**로 재생(파일 자체가 짧음).
  - [원본 덮어쓰기] 경고 후 진행 시 동작 확인.
  - 길이/파형이 깨지지 않는지, iOS/Android 모두 확인.

- [ ] **Step 3: 결과 기록** — 확인된 동작/이슈를 PR 설명 또는 커밋 메시지에 요약.

- [ ] **Step 4: 커밋(있다면 설정 변경만)**

```bash
git add -A
git commit -m "chore(native): trim dev build 검증 및 설정 반영"
```

---

## Self-Review

- **Spec 커버리지(스펙 2.6):** 로컬 모듈(T1), iOS AVAssetExportSession(T2), Android MediaExtractor+MediaMuxer(T3), JS 래퍼+폴백(T4), 에디터 저장 연결+두 버튼 UI(T5), dev build 수동 검증(T6). 무손실/재인코딩 없음/dev build 필요/미존재 시 가상 폴백 모두 반영. ✔
- **플레이스홀더:** 네이티브 코드/그래들/포드스펙/TS 모두 실제 내용. 단, T6은 본질적으로 수동 검증(헤드리스 불가)임을 명시. ✔
- **타입 일관성:** `getAudioTrimModule()`/`AudioTrimNative.trim`, `isNativeTrimAvailable`/`trimToFile(srcUri,range)`, `saveTrimmedFile(songId,tempUri)`, `addVersion(...extra)`(Plan 2와 동일 시그니처) — 일치. ✔
- **회귀:** 네이티브 미가용 시 Plan 2의 가상 트림 경로/테스트가 그대로 유지(T5 else 분기). ✔
- **알려진 한계:** T5의 overwrite는 원본 파일을 실제로는 보존하고 새 파일 버전을 만든다(안전). 진짜 파일 삭제까지 원하면 후속 작업으로 분리.
```
