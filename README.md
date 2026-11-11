# CHASE CITY

Three.js로 만든 HTML5 3D 자동차 경찰 추격 게임입니다. 자동 전진하는 차량으로 선명한 색상의 로우폴리 도시, 인도, 공원을 달리며 경찰을 피하세요. 건물과 월드 경계는 통과할 수 없습니다.

## 실행

Node.js 22.12 이상(또는 20.19 이상).

```sh
npm ci
npm run dev
```

브라우저에서 터미널에 표시된 주소를 엽니다. 같은 네트워크의 iPhone에서도 개발 서버의 LAN 주소로 접속할 수 있습니다.

- PC: ← / → 또는 A / D 조향, Space 드리프트, P / Escape 일시정지
- 모바일: 좌우 버튼을 누른 상태로 조향, DRIFT 동시 터치 지원
- 전진은 자동입니다. 충돌 시 내구도가 감소하며, 내구도 0이면 차량 파괴로 종료됩니다.
- 경찰 2대 이상이 가까이 있고 속도가 낮은 상태로 4초 지속되면 체포됩니다. 거리를 벌리면 체포 게이지가 감소합니다.
- 화면 전환 및 포커스 상실 시 자동 일시정지합니다. 최고 도주 시간은 기기에 저장합니다.

## 구조

```text
src/
  main.js              게임 상태와 고정 시간 간격 루프
  game/config.js       차량과 월드 설정
  game/input.js        키보드, 다중 포인터 입력
  game/simulation.js   차량 운동, 충돌, 체포, 경찰 AI
  world/layout.js      도시 배치 및 건물 충돌 해석
  render/scene.js      Three.js 도시, 차량, 카메라, 스키드 마크
  ui/interface.js      시작, 일시정지, 게임오버, HUD
  style.css            반응형 UI와 안전 영역
public/_headers        Cloudflare 정적 응답 헤더
 tests/                 시뮬레이션과 브라우저 회귀 테스트
```

시뮬레이션은 Three.js와 DOM에 의존하지 않습니다. 미션·보석·차량·월드 시스템을 추가할 때 시뮬레이션과 설정/월드 데이터로 상태를 확장하고 렌더러와 UI에서 표시할 수 있습니다. 현재는 한 월드, 한 차량, 경찰 4대의 기본 버전입니다. 경찰은 도로 교차점을 경유하고 근접 추격하며, 건물 충돌을 동일하게 적용합니다. 전역 최단 경로 탐색은 사용하지 않습니다.

## 검증

```sh
npm test
npx playwright install chromium webkit
npm run test:browser
npm run build
npm run preview
```

브라우저 테스트는 데스크톱 Chromium과 iPhone 13 크기의 WebKit에서 실행합니다. WebKit 에뮬레이션은 실제 iPhone 기기의 성능·Safari 검증을 대체하지 않습니다. 개발 서버의 `?debug` 파라미터에서만 자동화용 상태 조회가 활성화되며 프로덕션 빌드에서는 제외됩니다.

## Cloudflare Pages 배포

1. Pages에서 GitHub 저장소 `wonkillz/chase-city`를 연결합니다.
2. 프로덕션 브랜치: `main`, 빌드 명령: `npm run build`, 출력 디렉터리: `dist`.
3. 환경 변수 `NODE_VERSION=22`를 설정합니다. 루트 디렉터리는 저장소 루트입니다.
4. 배포하면 HTTPS 주소에서 PC와 iPhone Safari로 플레이할 수 있습니다.

서버·DB·API 키·런타임 환경 변수는 필요하지 않습니다. Three.js는 번들에 포함됩니다. Google Fonts는 선택적 외부 글꼴이며 오프라인에서는 시스템 글꼴로 표시됩니다. 배포는 별도 Cloudflare 계정 연결 후 진행합니다.
