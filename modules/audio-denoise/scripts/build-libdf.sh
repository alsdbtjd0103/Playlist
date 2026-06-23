#!/usr/bin/env bash
#
# libDeepFilter(DeepFilterNet C API)를 iOS/Android 타깃으로 크로스 컴파일하고,
# 산출물(정적 라이브러리 + 헤더)을 이 모듈이 기대하는 위치에 배치한다.
#
#   iOS   : ios/lib/libdf.a   (xcframework/lipo 결합)  + ios/lib/df.h
#   Android: android/src/main/cpp/prebuilt/<abi>/libdf.a  + android/src/main/cpp/include/df.h
#            → CMakeLists.txt 가 df_jni.c 와 링크해 libdf_jni.so 생성
#
# ⚠️ 빌드 환경(로컬/CI)에서 실행. 헤드리스 에이전트는 Rust/NDK 빌드 불가.
#
# 사전 준비:
#   rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
#   rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
#   cargo install cargo-ndk cbindgen
#   export ANDROID_NDK_HOME=~/Library/Android/sdk/ndk/<버전>
#   git clone https://github.com/Rikorose/DeepFilterNet
#   # libDeepFilter(C API) crate 의 Cargo.toml 에 staticlib 출력이 켜져 있어야 함:
#   #   [lib]\n  crate-type = ["staticlib", "cdylib"]
#
# 사용법:
#   DF_SRC=/path/to/DeepFilterNet \
#   CRATE=libDF \
#   ./modules/audio-denoise/scripts/build-libdf.sh [ios|android|all]
#
set -euo pipefail

TARGETS="${1:-all}"
DF_SRC="${DF_SRC:?DeepFilterNet 소스 경로를 DF_SRC 로 지정하세요 (git clone Rikorose/DeepFilterNet)}"
CRATE_SUBDIR="${CRATE:-libDF}"                 # C API crate 디렉터리(저장소 기준)
CRATE_DIR="$DF_SRC/$CRATE_SUBDIR"
MODULE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

IOS_LIB="$MODULE_DIR/ios/lib"
CPP_DIR="$MODULE_DIR/android/src/main/cpp"
ANDROID_PREBUILT="$CPP_DIR/prebuilt"
INCLUDE_DIR="$CPP_DIR/include"

mkdir -p "$IOS_LIB" "$ANDROID_PREBUILT" "$INCLUDE_DIR"
[ -d "$CRATE_DIR" ] || { echo "❌ C API crate 디렉터리를 찾을 수 없습니다: $CRATE_DIR (CRATE 환경변수로 조정)"; exit 1; }

# 빌드된 .a 를 찾아 복사하는 헬퍼 (crate 명 다양성 대응)
copy_staticlib() { # <triple> <dest libdf.a>
  local triple="$1" dest="$2"
  local found
  found="$(ls "$DF_SRC"/target/"$triple"/release/lib*.a 2>/dev/null | grep -E 'libdeep_filter|libdf|libdeepfilter' | head -1 || true)"
  [ -z "$found" ] && found="$(ls "$DF_SRC"/target/"$triple"/release/lib*.a 2>/dev/null | head -1 || true)"
  [ -z "$found" ] && { echo "❌ $triple staticlib(.a) 를 찾지 못했습니다. Cargo.toml 의 crate-type=staticlib 확인."; exit 1; }
  cp "$found" "$dest"
  echo "   → $dest  ($(basename "$found"))"
}

gen_header() {
  echo "==> df.h 생성(cbindgen)"
  if command -v cbindgen >/dev/null 2>&1; then
    ( cd "$CRATE_DIR" && cbindgen --lang c --output "$INCLUDE_DIR/df.h" ) \
      && cp "$INCLUDE_DIR/df.h" "$IOS_LIB/df.h" \
      && echo "   → $INCLUDE_DIR/df.h, $IOS_LIB/df.h"
  else
    echo "   ⚠️ cbindgen 미설치 — df.h 를 수동 작성하세요(NATIVE_BINARIES.md 의 시그니처 참고)."
  fi
}

build_ios() {
  echo "==> iOS staticlib 빌드"
  ( cd "$DF_SRC" && for T in aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios; do
      echo "   - $T"; cargo build -p "$(basename "$CRATE_SUBDIR")" --release --target "$T"
    done )
  # 시뮬레이터(arm64-sim + x86_64)는 lipo 로 묶고, device(arm64)와 함께 xcframework 권장.
  local dev="$DF_SRC/target/aarch64-apple-ios/release"
  local sim_arm="$DF_SRC/target/aarch64-apple-ios-sim/release"
  local sim_x86="$DF_SRC/target/x86_64-apple-ios/release"
  local devA simA
  devA="$(ls "$dev"/lib*.a | head -1)"; simA="$(ls "$sim_arm"/lib*.a | head -1)"
  lipo -create "$simA" "$(ls "$sim_x86"/lib*.a | head -1)" -output "$IOS_LIB/libdf-sim.a" 2>/dev/null || cp "$simA" "$IOS_LIB/libdf-sim.a"
  # 단일 디바이스 .a (xcframework 미사용 시 디바이스 빌드만으로 충분한 경우)
  cp "$devA" "$IOS_LIB/libdf.a"
  echo "   → $IOS_LIB/libdf.a (device arm64), libdf-sim.a (simulator)"
  echo "   * 디바이스+시뮬 동시 지원하려면 xcframework 로 묶으세요:"
  echo "     xcodebuild -create-xcframework -library $IOS_LIB/libdf.a -library $IOS_LIB/libdf-sim.a -output $IOS_LIB/df.xcframework"
}

build_android() {
  echo "==> Android staticlib 빌드 (cargo-ndk)"
  command -v cargo-ndk >/dev/null 2>&1 || { echo "❌ cargo-ndk 필요 (cargo install cargo-ndk)"; exit 1; }
  declare -A ABI_TRIPLE=(
    [arm64-v8a]=aarch64-linux-android
    [armeabi-v7a]=armv7-linux-androideabi
    [x86_64]=x86_64-linux-android
  )
  for abi in "${!ABI_TRIPLE[@]}"; do
    local triple="${ABI_TRIPLE[$abi]}"
    echo "   - $abi ($triple)"
    ( cd "$DF_SRC" && cargo ndk -t "$abi" build -p "$(basename "$CRATE_SUBDIR")" --release )
    mkdir -p "$ANDROID_PREBUILT/$abi"
    copy_staticlib "$triple" "$ANDROID_PREBUILT/$abi/libdf.a"
  done
}

gen_header
case "$TARGETS" in
  ios)     build_ios ;;
  android) build_android ;;
  all)     build_ios; build_android ;;
  *) echo "사용법: $0 [ios|android|all]"; exit 1 ;;
esac

echo
echo "✅ 배치 확인:"
echo "   - $IOS_LIB/libdf.a (+ df.h, module.modulemap)"
echo "   - $ANDROID_PREBUILT/{arm64-v8a,armeabi-v7a,x86_64}/libdf.a"
echo "   - $INCLUDE_DIR/df.h"
echo "   - 모델 가중치: $MODULE_DIR/assets/DeepFilterNet3_model.tar.gz (Android는 assets, iOS는 resource bundle)"
echo "   그다음: npx expo prebuild --clean && npx expo run:android (또는 run:ios)"
