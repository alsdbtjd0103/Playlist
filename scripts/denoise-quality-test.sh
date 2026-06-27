#!/usr/bin/env bash
#
# Phase 0 — 잡음 제거 품질 게이트 (데스크톱 DeepFilterNet A/B 검증)
#
# 목적: 네이티브 구현(수일) 착수 전에, DeepFilterNet3가 "내 노래방 녹음"을
#       망가뜨리지 않는지 몇 분 만에 검증한다. (가창 손상 여부가 최대 리스크)
#
# 사용법:
#   1) 노래방에서 옆방 소리 섞인 실제 녹음(.m4a/.wav) 몇 개를 samples/ 에 넣는다.
#      - 반주 있음/없음, 옆방 큼/작음을 섞을 것.
#   2) ./scripts/denoise-quality-test.sh [입력디렉터리] [출력디렉터리]
#      (기본: 입력=./denoise-samples  출력=./denoise-samples/out)
#   3) out/ 안의 *_원본.wav 와 *_정제.wav 를 번갈아 들으며 A/B 판정.
#
# 합격 기준(중요도 순):
#   (a) 내 목소리/가창 손상 없음(아티팩트·먹먹함 허용 범위)  ← 가장 중요
#   (b) 반주가 있으면 과도하게 뭉개지지 않음
#   (c) 옆방 소리가 체감상 줄어듦(완전 제거 아님 — 부분 완화면 합격)
#
# (a) 불합격이면 → B안(온디바이스) 보류, C안(Krisp BVC 서버 처리) 재검토.
#
# 의존성:
#   - 디코더: ffmpeg(있으면 우선) 또는 macOS 내장 afconvert(자동 폴백) — 둘 중 하나면 됨
#   - deep-filter CLI   (릴리스 바이너리 권장: torch 불필요)
#       https://github.com/Rikorose/DeepFilterNet/releases  (예: deep-filter-*-aarch64-apple-darwin)
#       또는  pip install deepfilternet
#
set -euo pipefail

IN_DIR="${1:-./denoise-samples}"
OUT_DIR="${2:-${IN_DIR}/out}"
SR=48000   # DeepFilterNet 동작 표준: 48kHz mono

# --- 의존성 확인 ---
# 디코드(m4a→48kHz mono wav)는 ffmpeg 우선, 없으면 macOS 내장 afconvert 로 폴백.
# (이 맥은 Xcode CLT 구버전 탓에 brew ffmpeg 소스빌드가 깨져서 afconvert 경로가 기본)
if command -v ffmpeg >/dev/null 2>&1; then
  DECODER=ffmpeg
elif command -v afconvert >/dev/null 2>&1; then
  DECODER=afconvert
else
  echo "❌ ffmpeg 또는 afconvert(맥 내장) 중 하나가 필요합니다. (brew install ffmpeg)"
  exit 1
fi

# 입력 오디오 → 48kHz mono wav
to_48k_mono_wav() { # <src> <dest.wav>
  if [ "$DECODER" = ffmpeg ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$1" -ac 1 -ar "$SR" "$2"
  else
    afconvert -f WAVE -d "LEI16@${SR}" -c 1 "$1" "$2"
  fi
}

# 원본/정제 mono wav 2개를 좌/우 스테레오 1파일로 합치기 (A/B 비교용)
# ffmpeg 있으면 amerge, 없으면 파이썬 stdlib(wave)로 인터리브.
merge_lr() { # <left.wav> <right.wav> <out.wav>
  if [ "$DECODER" = ffmpeg ]; then
    ffmpeg -hide_banner -loglevel error -y -i "$1" -i "$2" \
      -filter_complex "[0:a][1:a]amerge=inputs=2[a]" -map "[a]" -ac 2 "$3"
  else
    python3 - "$1" "$2" "$3" <<'PY'
import sys, wave
L, R, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
l, r = wave.open(L, 'rb'), wave.open(R, 'rb')
sw, fr = l.getsampwidth(), l.getframerate()
ld, rd = l.readframes(l.getnframes()), r.readframes(r.getnframes())
n = min(len(ld), len(rd))                      # 길이 다르면 짧은 쪽 기준
out = bytearray()
for i in range(0, n, sw):
    out += ld[i:i+sw] + rd[i:i+sw]             # L, R 인터리브
w = wave.open(OUT, 'wb')
w.setnchannels(2); w.setsampwidth(sw); w.setframerate(fr)
w.writeframes(bytes(out)); w.close()
PY
  fi
}

if ! command -v deep-filter >/dev/null 2>&1; then
  echo "❌ 'deep-filter' CLI 가 필요합니다."
  echo "   설치: pip install deepfilternet   또는   https://github.com/Rikorose/DeepFilterNet 릴리스 바이너리"
  exit 1
fi

if [ ! -d "$IN_DIR" ]; then
  echo "❌ 입력 디렉터리가 없습니다: $IN_DIR"
  echo "   먼저 실제 녹음 샘플(.m4a/.wav)을 여기에 넣어주세요."
  mkdir -p "$IN_DIR"
  echo "   (빈 디렉터리를 만들어 뒀습니다: $IN_DIR)"
  exit 1
fi

mkdir -p "$OUT_DIR"
shopt -s nullglob nocaseglob

samples=( "$IN_DIR"/*.m4a "$IN_DIR"/*.wav "$IN_DIR"/*.aac "$IN_DIR"/*.mp3 )
if [ ${#samples[@]} -eq 0 ]; then
  echo "❌ $IN_DIR 안에 처리할 오디오(.m4a/.wav/.aac/.mp3)가 없습니다."
  exit 1
fi

echo "🎚  DeepFilterNet 품질 검증 시작 — 샘플 ${#samples[@]}개, ${SR}Hz mono"
echo "    입력: $IN_DIR"
echo "    출력: $OUT_DIR"
echo

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

for src in "${samples[@]}"; do
  base="$(basename "${src%.*}")"
  echo "▶  $base"

  # 1) 원본 → 48kHz mono wav (DFN 입력 표준)
  orig_wav="$OUT_DIR/${base}_원본.wav"
  to_48k_mono_wav "$src" "$orig_wav"

  # 2) DeepFilterNet 처리 → 정제 wav
  #    deep-filter는 출력 디렉터리에 입력과 같은 이름으로 저장하므로 임시폴더 경유 후 리네임
  deep-filter "$orig_wav" -o "$tmp" >/dev/null 2>&1 || {
    echo "   ⚠️  deep-filter 처리 실패 — 스킵"; continue;
  }
  proc="$tmp/$(basename "$orig_wav")"
  clean_wav="$OUT_DIR/${base}_정제.wav"
  mv "$proc" "$clean_wav"

  # 3) (선택) 좌=원본 / 우=정제 스테레오로 합쳐 한 파일에서 A/B 비교
  ab_wav="$OUT_DIR/${base}_AB(L원본_R정제).wav"
  merge_lr "$orig_wav" "$clean_wav" "$ab_wav" || true

  echo "   ✅ ${base}_원본.wav / ${base}_정제.wav (+ AB 스테레오)"
done

echo
echo "🎧  완료. $OUT_DIR 안의 _원본 / _정제 를 번갈아 들으며 판정하세요."
echo "    - 가창 손상 없음(a)이 최우선. 불합격이면 B안 보류 → C안(서버 Krisp) 검토."
echo "    - AB(L원본_R정제) 파일은 좌/우 채널로 동시 비교용입니다(헤드폰 권장)."
