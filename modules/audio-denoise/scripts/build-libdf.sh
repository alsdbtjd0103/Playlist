#!/usr/bin/env bash
#
# libDeepFilter(DeepFilterNet C API)를 iOS/Android 타깃으로 크로스 컴파일한다.
# 산출물은 이 모듈의 ios/lib, android/src/main/jniLibs 에 배치된다.
#
# ⚠️ 이 스크립트는 빌드 환경(로컬 머신/CI)에서 실행해야 한다 — Rust 툴체인 필요.
#    헤드리스 에이전트 환경에서는 바이너리를 만들 수 없으므로, 개발자가 직접 1회 실행한다.
#
# 사전 준비:
#   rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
#   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android i686-linux-android
#   cargo install cargo-ndk
#   # DeepFilterNet 소스: git clone https://github.com/Rikorose/DeepFilterNet
#   #   libDeepFilter (C API) crate 위치: DeepFilterNet/libDF (또는 deep_filter_ladspa 참고)
#
# 사용법:
#   DF_SRC=/path/to/DeepFilterNet ./modules/audio-denoise/scripts/build-libdf.sh
#
set -euo pipefail

DF_SRC="${DF_SRC:?DeepFilterNet 소스 경로를 DF_SRC 로 지정하세요 (git clone Rikorose/DeepFilterNet)}"
MODULE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IOS_LIB="$MODULE_DIR/ios/lib"
ANDROID_JNI="$MODULE_DIR/android/src/main/jniLibs"
CRATE_DIR="$DF_SRC/libDF"   # C API crate (cbindgen 헤더 + cdylib/staticlib)

mkdir -p "$IOS_LIB" "$ANDROID_JNI"

echo "==> 헤더 생성(cbindgen) — df.h"
( cd "$CRATE_DIR" && cbindgen --config cbindgen.toml --crate deep_filter_ladspa --output "$IOS_LIB/df.h" ) || \
  echo "   (cbindgen 미설치 또는 crate명 상이 — DeepFilterNet libDF의 헤더 생성 절차를 확인하세요)"

echo "==> iOS staticlib 빌드"
for T in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
  ( cd "$CRATE_DIR" && cargo build --release --target "$T" --crate-type staticlib )
done
# 디바이스(arm64) + 시뮬레이터(arm64-sim/x86_64) → xcframework 또는 lipo 결합
echo "   * 생성된 libdf.a 들을 xcframework로 묶거나 lipo로 결합해 $IOS_LIB/libdf.a 로 배치하세요."

echo "==> Android .so 빌드 (cargo-ndk)"
( cd "$CRATE_DIR" && cargo ndk \
    -t arm64-v8a -t armeabi-v7a -t x86_64 -t x86 \
    -o "$ANDROID_JNI" \
    build --release )

echo
echo "✅ 완료 후 배치 확인:"
echo "   - $IOS_LIB/libdf.a  (+ df.h)"
echo "   - $ANDROID_JNI/{arm64-v8a,armeabi-v7a,x86_64,x86}/libdf.so"
echo "   - 모델 가중치: $MODULE_DIR/assets/ 에 DeepFilterNet3 모델(tar) 배치 (ensureModelCopied가 documentDir로 복사)"
