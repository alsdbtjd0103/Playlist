# audio-denoise 네이티브 바이너리 안내

이 모듈은 **DeepFilterNet(libDeepFilter)** 바이너리와 모델 가중치를 필요로 한다.
소스(Swift/Kotlin/JNI shim/TS)는 저장소에 포함되나, **바이너리·모델·생성 헤더는
용량/라이선스상 커밋하지 않으며 개발자가 빌드 환경에서 1회 생성**해 배치한다.
(헤드리스 에이전트는 Rust/NDK 빌드 불가)

## 구조 (iOS는 Swift가 C를 직접 호출, Android는 JNI shim 경유)

```
modules/audio-denoise/
├── ios/
│   ├── AudioDenoiseModule.swift     # (커밋됨) Swift가 libdf C API 직접 호출
│   └── lib/
│       ├── module.modulemap         # (커밋됨) df.h → Swift 모듈 libdf
│       ├── df.h                     # ← 생성물(cbindgen)
│       └── libdf.a                  # ← iOS staticlib (device; 시뮬 동시 지원은 df.xcframework)
└── android/src/main/
    ├── java/.../AudioDenoiseModule.kt, DfNative.kt   # (커밋됨)
    └── cpp/
        ├── df_jni.c                 # (커밋됨) C ABI ↔ JNI 브리지 → libdf_jni.so
        ├── CMakeLists.txt           # (커밋됨) df_jni.c + prebuilt libdf.a 링크
        ├── include/df.h             # ← 생성물(cbindgen)
        └── prebuilt/<abi>/libdf.a   # ← Android staticlib (arm64-v8a, armeabi-v7a, x86_64)
└── assets/
    └── DeepFilterNet3_model.tar.gz  # ← 번들 모델(~8MB), 최초 사용 시 앱 저장소로 복사
```

**핵심:** Android는 `System.loadLibrary("df_jni")` → CMake가 `df_jni.c`를 prebuilt `libdf.a`와
정적 링크해 **`libdf_jni.so` 하나**로 패키징한다(별도 libdf.so 미배포). iOS는 modulemap으로
`df.h`를 Swift에 노출하므로 shim 불필요.

## 생성 방법

```bash
# 1) Rust 타깃/툴 준비 + NDK 경로 (build-libdf.sh 주석 참고)
git clone https://github.com/Rikorose/DeepFilterNet
# 2) C API crate(Cargo.toml)에 staticlib 출력 켜기:  crate-type = ["staticlib", "cdylib"]
# 3) 빌드 + 배치
DF_SRC=$(pwd)/DeepFilterNet CRATE=libDF \
  ./modules/audio-denoise/scripts/build-libdf.sh all
# 4) DeepFilterNet3 모델을 modules/audio-denoise/assets/ 에 배치
# 5) package.json 의 expo.autolinking.exclude 에서 "audio-denoise" 제거 (아래 참고)
# 6) npx expo prebuild --clean && npx expo run:android   (또는 run:ios)
```

## ⚠️ autolinking 제외 (바이너리 준비 전까지)

바이너리가 없으면 빌드가 깨지므로, **준비 전까지** `package.json` 에서 autolinking 제외해 둔다:

```json
"expo": { "autolinking": { "exclude": ["audio-denoise"] } }
```

이 상태에선 네이티브 모듈이 링크되지 않아 `isNativeDenoiseAvailable()` 가 false →
앱에서 "잡음 제거" 메뉴가 숨겨지고 나머지 기능엔 영향이 없다.
**위 1~4단계로 바이너리/모델을 배치한 뒤 이 exclude 를 제거**하면 기능이 활성화된다.

## C API (df.h) 기대 시그니처

shim/Swift 는 다음을 전제로 작성됨. 생성된 헤더가 다르면 `df_jni.c`/`AudioDenoiseModule.swift` 호출부를 맞춘다.

```c
typedef struct DFState DFState;
DFState* df_create(const char* model_path, float atten_lim_db);  // atten_lim_db: 0=최대제거
size_t   df_get_frame_length(DFState*);                          // 48kHz hop(=480)
float    df_process_frame(DFState*, float* input, float* output);// hop 단위, 반환=local SNR
void     df_free(DFState*);
```

## .gitignore (루트에 규칙 있음)

```
modules/audio-denoise/ios/lib/*.a
modules/audio-denoise/ios/lib/df.h
modules/audio-denoise/ios/lib/df.xcframework/
modules/audio-denoise/android/src/main/cpp/prebuilt/
modules/audio-denoise/android/src/main/cpp/include/df.h
modules/audio-denoise/assets/*.tar.gz
```
