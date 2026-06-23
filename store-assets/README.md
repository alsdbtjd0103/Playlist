# 플레이스토어 등록 이미지

`npm run store:assets` 로 생성됩니다. (생성기: `scripts/generate-store-assets.js`)
배포 절차 전체는 [`docs/PLAY_STORE_RELEASE.md`](../docs/PLAY_STORE_RELEASE.md) 참고.

## 파일 → Play Console 입력 위치

| 파일 | 규격 | Play Console 위치 |
| --- | --- | --- |
| `play-icon-512.png` | 512×512 | 스토어 등록정보 → 앱 아이콘 |
| `feature-graphic.png` | 1024×500 | 스토어 등록정보 → 추천 그래픽(Feature graphic) |
| `screenshot-1-songs.png` | 1080×2340 | 스토어 등록정보 → 휴대전화 스크린샷 |
| `screenshot-2-detail.png` | 1080×2340 | 〃 |
| `screenshot-3-playlist.png` | 1080×2340 | 〃 |
| `screenshot-4-player.png` | 1080×2340 | 〃 |

> 휴대전화 스크린샷은 **최소 2장, 최대 8장**. 위 4장 순서대로 올리면 기능 흐름이 자연스럽게 소개됩니다.

## 스크린샷이 담은 기능

1. **곡 목록** — 검색·앨범아트로 부르고 싶은 곡 모으기
2. **곡 상세** — 녹음 버튼 + 버전별 별점/메모/대표 지정
3. **플레이리스트** — 셋리스트 정리·순서 변경
4. **재생 화면** — 웨이브폼·백그라운드 재생

## 다시 만들기 / 수정

문구·곡 목록·색상은 `scripts/generate-store-assets.js` 상단과 각 `screenN()` 함수에서 바꾼 뒤
`npm run store:assets` 를 다시 실행하면 됩니다. (한글 폰트는 번들 Pretendard 자동 사용)
