# audio-denoise 네이티브 바이너리 안내

이 모듈은 **DeepFilterNet(libDeepFilter)** 바이너리와 모델 가중치를 필요로 한다.
소스 코드(Swift/Kotlin/TS)는 저장소에 포함돼 있으나, **바이너리·모델은 용량/라이선스상 커밋하지 않으며
개발자가 빌드 환경에서 1회 생성**해 아래 위치에 배치한다. (헤드리스 에이전트는 빌드 불가)

## 배치 위치

```
modules/audio-denoise/
├── ios/lib/
│   ├── libdf.a          # iOS staticlib (device arm64 + sim 결합 / xcframework)
│   └── df.h             # cbindgen 생성 C 헤더
├── android/src/main/jniLibs/
│   ├── arm64-v8a/libdf.so
│   ├── armeabi-v7a/libdf.so
│   ├── x86_64/libdf.so
│   └── x86/libdf.so
└── assets/
    └── DeepFilterNet3_model.tar.gz   # 번들 모델(~8MB) — 최초 사용 시 documentDir로 복사
```

## 생성 방법

```bash
# 1) Rust 타깃/툴 준비 (build-libdf.sh 주석 참고)
# 2) DeepFilterNet 소스 클론
git clone https://github.com/Rikorose/DeepFilterNet
# 3) 빌드 스크립트 실행
DF_SRC=$(pwd)/DeepFilterNet ./modules/audio-denoise/scripts/build-libdf.sh
# 4) DeepFilterNet3 모델을 assets/ 에 배치
```

## C API (df.h) 기대 시그니처

네이티브 코드(`ios/AudioDenoiseModule.swift`, `android/.../DfNative.kt`)는 다음을 전제로 작성됨.
헤더 실제 시그니처가 다르면 양쪽 호출부를 맞춘다.

```c
typedef struct DFState DFState;
DFState* df_create(const char* model_path, float atten_lim_db);  // atten_lim_db: 0=최대제거
size_t   df_get_frame_length(DFState*);                          // 48kHz hop(=480)
float    df_process_frame(DFState*, float* input, float* output);// hop 단위, 반환=local SNR
void     df_free(DFState*);
```

## .gitignore

바이너리/모델은 추적하지 않는다(루트 `.gitignore`에 규칙 추가됨):
```
modules/audio-denoise/ios/lib/*.a
modules/audio-denoise/android/src/main/jniLibs/
modules/audio-denoise/assets/*.tar.gz
```
