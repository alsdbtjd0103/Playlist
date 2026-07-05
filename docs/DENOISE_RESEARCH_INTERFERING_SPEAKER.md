# 딥리서치: "옆방 화자만 제거하고 내 노래+반주는 보존" 기술·서비스·비용

> 작성 2026-07-05 · 딥리서치(소스 26개 fetch → 116 주장 추출 → 25개 적대적 검증, 24 확정/1 기각)
> 배경: 노래방 녹음(내 목소리 + 반주)에 옆방 사람들의 말소리가 섞임. DeepFilterNet(음성 denoiser)은
> 반주를 잡음으로 걷어내고 가창까지 뭉개서 실측 NO-GO. 그래서 "간섭 화자만" 제거하는 길을 조사.

## 결론 (한 줄)

**지금 바로 쓸 수 있는 상용/오픈소스 솔루션은 없다.** 관련 기술이 두 부류인데 **둘 다 방향이 어긋난다.**
근본적으로 어려운 문제이고, 후처리 AI보다 **입력단 개선**이 비용 대비 효과가 가장 크다.

## 왜 안 되나 — 기술이 두 갈래인데 둘 다 목표와 반대

### ① 타깃 화자 추출(TSE) / 개인화 음성강화(PSE) / VoiceFilter 계열
- 등록한 **한 명의 목소리만 남기고** 나머지(다른 화자 + 배경 + **음악**)를 전부 억제하는 구조.
- 즉 우리가 원하는 "음악 보존"과 **정반대** — 반주가 지워진다.
- VoiceFilter-Lite는 재생용 파형이 아니라 **ASR용 특징(log-Mel)** 을 출력 → `.m4a` 복원 불가.
- 학습 코퍼스가 WSJ0-2mix/LibriMix 등 **음성 전용**이라 음악을 아예 고려 안 함.
- 부작용: 객관지표(PESQ/STOI)가 좋아져도 **인공물(artifact)로 지각 품질을 해치고**, 원하는 목소리
  자체를 과하게 지우는 실패 모드(TSOS)가 있음.
- 출처: [VoiceFilter](https://arxiv.org/abs/1810.04826), [VoiceFilter-Lite](https://arxiv.org/pdf/2009.04323),
  [USEF-TSE](https://arxiv.org/html/2409.02615v2), [Meeami TSE](https://www.meeamitech.com/product/target-speaker-extraction),
  [E3Net/TSOS](https://arxiv.org/pdf/2204.00771), [난청 청취실험 PMC12340209](https://pmc.ncbi.nlm.nih.gov/articles/PMC12340209/)

### ② Krisp / 음원분리(Spleeter·UVR·Demucs) / DME(대사·음악·효과) 계열
- **특정 화자를 개별 선택 못 함.** 카테고리(음성 vs 음악) 또는 우세 화자 단위로만 가름.
- 그래서 **내 가창과 옆방 목소리가 같은 '음성'으로 묶임** → 둘을 못 나눔.
- Krisp Voice Isolation: 피치 기반 **우세 화자 한 명만** 남기고 다른 사람 목소리·비음성(음악 포함)을
  노이즈로 제거 → 선택 UI 없음, 반주 보존 불가.
- 음원분리(Demucs/Spleeter)는 "보컬 vs 반주"를 나눌 뿐 → 반주 스템은 살릴 수 있으나 **내 노래까지
  옆방 목소리와 함께 보컬로 묶여 통째로** 처리됨.
- 출처: [Krisp Voice Isolation](https://help.krisp.ai/hc/en-us/articles/5356050927644-Voice-Isolation-with-Krisp),
  [Cocktail Fork(음성/음악/효과 3분리)](https://arxiv.org/pdf/2110.09958),
  [AudioShake DME](https://www.audioshake.ai/products/dialogue-music-effects-separation),
  [Demucs](https://github.com/facebookresearch/demucs)

## 서비스/기술 비교표

| 도구 | 특정 화자만 제거 | 반주(음악) 보존 | 비용 | 모바일 적합성 |
|---|---|---|---|---|
| **DeepFilterNet** (시도함) | ✗ | ✗ (반주 걷힘) | 무료(OSS) | 온디바이스 O, 하지만 용도 불일치 |
| **Krisp** Voice Isolation | ✗ (우세화자만) | ✗ | 유료 SDK/API | 실시간 SDK 있음, 용도 불일치 |
| **ElevenLabs** Voice Isolator | ✗ (목소리 격리, 배경·음악 제거) | ✗ | API 분당 과금 | 클라우드 |
| **Adobe** Podcast(Enhance Speech) | ✗ (음성 강화, 음악 제거) | ✗ | 웹 무료/유료 | 클라우드 |
| **TSE / VoiceFilter(-Lite)** | △ (등록 1인 보존=반대) | ✗ | 연구/자체구현 | 온디바이스 2.2MB 有, 단 ASR특징 출력 |
| **Demucs / Spleeter / UVR** (음원분리) | ✗ (모든 보컬 묶임) | ✓ 반주 스템은 분리 가능 | 무료(OSS) | 무거움, RN 래퍼 미탑재 |
| **AudioShake** Multi-Speaker Separation | ○ 화자별 스템 분리(가장 근접) | ○ (음악 별도 스템) | **비공개(문의)** | API/SDK, 엣지 <50ms |
| **pyannote** speech-separation-ami | ○ 분리+diarization | — (음성 전용) | 무료(OSS) | 자체 GPU 호스팅 |
| **LALAL.ai** | ✗ (스템 분리형) | ✓ 반주 분리 | 분당 팩 과금 | 클라우드 |

> △=방향이 반대, ○=부분적으로 가능하나 "골라 삭제 + 반주 보존" 완성 워크플로는 미문서화, ✗=불가

## 모바일(React Native) 현실

- **당장 쓸 온디바이스 화자분리/음원분리 RN 래퍼가 없음.**
  [react-native-sherpa-onnx](https://github.com/XDcobra/react-native-sherpa-onnx)(v0.4.3 기준)는
  diarization(0.5.0 예정)·source separation(0.6.0 예정) **미탑재**. 현재 제공되는 건 단일화자
  denoiser(GTCRN/DPDFNet)뿐 → DeepFilterNet과 같은 실패.
- 온디바이스 TSE는 기술적으론 존재(VoiceFilter-Lite 2.2MB 스트리밍)하나, 재생 오디오가 아니라 ASR
  특징 출력 + 보존 대상이 한 화자라 노래방 용도에 직접 사용 불가.

## 비용 (근거 얇음 — 참고만)

- **AudioShake**(가장 근접): API/SDK 가격 **비공개**, 영업 문의 필요.
- **LALAL.ai / ElevenLabs Voice Isolator**: 분 단위 과금(팩/구독). 단 둘 다 "특정 화자만 제거"는 안 됨.
- **자체 호스팅**(pyannote/Demucs): [RunPod](https://www.runpod.io/pricing) 등 GPU 시간당 과금 →
  인디 규모엔 운영 부담. 상업 라이선스도 모델별 확인 필요.
- 검증된 수치가 부족해 **비용 항목은 신뢰도 낮음**(리서치 caveat).

## 현실적 우회책 (권고 순)

1. **입력단 개선 (비-AI, 최고 ROI)** — 애초에 옆방 소리가 덜 섞이게:
   - 반주를 **헤드폰/이어폰으로 모니터링**해서 스피커로 새어 마이크에 잡히지 않게(반주 누출↓).
   - 지향성(단일지향) 마이크·조용한 위치·입 가까이 녹음.
   - → 후처리 AI보다 싸고 확실. **가장 추천.**
2. **수동 편집 도구 제공** — 이미 앱에 **트림(구간 자르기)** 이 있음. "옆방 소리 큰 구간 잘라내기"를
   사용자가 직접 하도록 안내하는 게 현재로선 가장 실용적.
3. **클라우드 다중화자 분리 + 수동 편집** — AudioShake Multi-Speaker 또는 pyannote로 화자 스템 분리
   후 옆방 화자 스템만 빼고 재합성. 품질·비용 불확실, 워크플로 복잡 → **투자 전 샘플 PoC 필수.**
4. **커스텀 모델**(제거 대상=옆방 화자, 음악 보존 학습) — 데이터·비용상 인디에겐 비현실적.

## 남은 검증 질문 (필요 시 다음 리서치)

- AudioShake Multi-Speaker의 **실단가**와, 옆방 화자만 빼고 가창+반주 재합성하는 워크플로가 노래방
  녹음에서 실제로 품질이 나오는가?
- VAD+diarization으로 **옆방 말소리 구간만 국소 억제**(나머지 원본 유지)하는 하이브리드가 전체 강화보다
  아티팩트가 적은가? (프로토타입 가치 있음)

## 최종 권고

**자동 잡음/화자 제거 기능은 지금 접는 게 맞다.** "노래+반주 유지, 옆방 화자만 제거"는 상용·오픈소스로
바로 안 되고, 되는 쪽(TSE)은 방향이 반대이며, 모바일 온디바이스 경로도 아직 비어 있다. 대신 **①녹음
가이드(헤드폰 모니터링)** 와 **②기존 트림 기능**으로 실용적 대안을 제공하고, 정말 필요하면 나중에
**AudioShake 다중화자 분리 클라우드 PoC**만 샘플로 저비용 검증해보는 순서를 권한다.
