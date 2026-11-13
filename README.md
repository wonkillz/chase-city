# CHASE CITY V1.8

Three.js HTML5 자동차 경찰 추격 게임. V1.8은 V1.7의 체포·바리케이드·화면 밖 증원·탈출을 그대로 유지하면서 **경찰 압박(측면·전방)**, **실제 다중 충돌과 2~3대 연쇄 폭발 연출**, **영구 잔해(경찰차 본체·파편·화염·연기)**를 강화합니다.

```sh
npm ci
npm run dev
```

Node.js 22.12 이상(또는 20.19 이상). ← / → 또는 A / D로 조향하고 P / Escape로 일시정지합니다. 모바일은 좌우 버튼을 누릅니다. 자동 전진하며 드리프트 버튼은 없습니다. 60초 생존 후 외곽 최종 게이트를 통과하면 `ESCAPED!`와 500 크레딧을 한 번 지급합니다.

## V1.8 변경 내용

- **역할 기반 경찰 압박 (`src/game/police.js`):** 플레이어에 가장 가까운 1대는 후방 추격, 2번째는 측면 밀착(옆 차선에 붙어 조임), 나머지는 전방 차단을 맡습니다. 전방 차단차는 위치를 잡을 때만 27.5(+최대 2) 속도로 질주하고, 절반은 A* 경로에 플레이어 주변 감점을 주어 **평행 도로로 돌아 앞/옆 골목에서** 나타납니다. 플레이어 앞에 들어선 차단차는 정면 돌진 대신 **감속하며 도로를 막아** 피할 여지를 줍니다. 플레이어가 느려지거나 갇히면(약 1.2초 평균 이동 속도 13 미만) 모든 경찰이 기존 포위 동작으로 모여 3초 체포가 그대로 작동합니다. 바로 뒤의 추격차는 매초 들이받는 대신 꼬리를 물듯 속도를 맞춥니다.
- **무의미한 자폭 감소, 실제 충돌 유지:** 같은 차선·같은 방향의 경찰은 추돌하지 않고 간격을 유지하거나(후방 추격차) 옆 차선으로 추월합니다(측면·전방 역할). 플레이어와 22 이상 떨어진 곳에서 마주 오거나 교차하는 경찰은 우측으로 비키고 감속합니다. 플레이어 주변에서 다른 방향으로 모여드는 차량의 충돌은 그대로 물리 계산되므로 실제 다중 충돌이 발생합니다. 시간·난수로 폭발시키는 로직은 여전히 없습니다.
- **2~3대 연쇄 폭발 (`simulation.js`):** 연쇄의 각 단계는 0.22초씩 차례로 화면·사운드에 나타납니다(물리·피해·잔해는 같은 시점에 계산). 폭발 에너지는 단계마다 62%로 줄어 이미 손상된 이웃만 연쇄되고, 무리 전체가 한 번에 사라지는 4대 이상 연쇄는 줄었습니다. 뒤 단계 폭발일수록 크게 표시되고, 플레이어 근처 폭발마다 카메라가 흔들립니다(그리기 직전에만 적용되어 증원·가시성 계산에는 영향 없음).
- **영구 잔해 (`src/render/wrecks.js`, `explosions.js`):** 폭발한 경찰차는 공중에서 뒤집혀 지붕으로 떨어지고, **같은 자세의 그을린 경찰차 본체**(경광등·바퀴 포함)가 그대로 남습니다. 바닥 그을음, 붉은 잔불 빛, 5개 불꽃과 6개 연기 기둥이 RESTART 전까지 계속 탑니다. 폭발로 튄 파편 18개는 착지 후 사라지지 않고 InstancedMesh로 옮겨져 **게임 종료까지 도로에 남습니다**(재질당 그리기 1회).

V1.7의 3초 포위 체포, A* 추격·최대 8대 증원, 화면 밖 후방 증원 규칙, 노란 전체 폭 바리케이드/우회로, 플레이어 건물 피해 0과 벽 슬라이딩, 건물 투명화, 먼지·스키드, Web Audio, 음소거·일시정지, 탈출 미션·보상을 유지합니다. 조정값은 `src/game/config.js`의 `frontSprintSpeed`, `blockerApproachSpeed`, `flankSprintSpeed`, `chainStepSeconds`, `chainFalloff`, `frontBlockStart`입니다.

## 검증

```sh
npm test
npx playwright install chromium webkit
npm run test:browser
node scripts/reproduce-v16.js
node scripts/measure-v17.js
node scripts/measure-v18.js            # V1.8 압박·다중 폭발 측정
node scripts/measure-v18.js <V1.7 경로>  # 같은 측정을 V1.7 체크아웃에 실행
npm run build
npm run preview
# 별도 터미널: 프로덕션 실행 확인
node scripts/production-smoke.js
```

`reproduce-v16.js`는 기본 시작 위치에서 처음 5초 직진 후 우회전 입력만 유지합니다. 모바일 브라우저 재현은 START부터 우회전하며, 추가 정상 경로는 `tests/v17.test.js`에서 검증합니다. `measure-v17.js`는 PC/휴대폰 카메라, 6개 시드의 일반·급회전 주행 및 2개 시드 직진 주행에서 자연 충돌·폭발·증원을 기록합니다. 경찰 배치·내구도·최고속도·증원·미션을 변경하지 않고 실제 AI 포위/체포 시간 기록을 출력합니다. 브라우저 검사는 같은 입력을 실제 requestAnimationFrame 게임 루프에서 실행합니다. 별도의 잔해 검사만 충돌 fixture와 고정 60 Hz 진행을 사용합니다.

재현 경로, 실제 화면과 시간 기록, 테스트 결과는 [TESTING.md](TESTING.md)에 있습니다. 과거 버전 수치는 `docs/*-v1.5.json` 등 버전별 파일에 보존합니다. 모바일 WebKit 에뮬레이션은 실제 iPhone 성능 검증을 대체하지 않습니다.

## 관련 코드

- `src/game/police.js`: V1.8 후방/측면/전방 역할, 매복 경로, 추월·간격 유지, 차단 감속.
- `src/render/wrecks.js`, `src/render/explosions.js`, `src/render/camera.js`: 뒤집힌 경찰차 잔해, 영구 파편, 단계별 연쇄 폭발, 카메라 흔들림.
- `scripts/measure-v18.js`, `tests/v18.test.js`, `tests/browser/v18.spec.js`: V1.8 측정과 검증.
- `src/game/arrest.js`: 차체 전체 및 조향을 고려한 탈출 공간 검사.
- `src/game/simulation.js`, `police.js`: 체포 진행, 밀림/상대 이동 기록, 포위 속도 및 상황별 폭발 피해.
- `src/game/wrecks.js`, `src/render/wrecks.js`: 실행 내 영구 데이터, 착지 장애물, 확장 렌더 캐시/거리별 이펙트 갱신.
- `src/game/spawning.js`: 실제 렌더 카메라 기준 차체 전체/여유 프러스텀 판정.
- `src/game/navigation.js`, `barricades.js`, `escape.js`, `missions.js`: 기존 경로 탐색·도로 통제·탈출.
- `src/render/scene.js`, `occlusion.js`, `trails.js`, `explosions.js`, `src/audio/sound.js`: 기존 렌더링·투명화·차량 효과·사운드.
- `scripts/reproduce-v16.js`, `tests/v16.test.js`, `tests/browser/v16.spec.js`: 정상 시작 재현 및 장시간/화면 밖/확장/종료 검증.

## Cloudflare Pages

프로덕션 브랜치 `main`, 빌드 `npm run build`, 출력 `dist`, Node.js 22. 루트 디렉터리는 저장소 루트입니다. 별도 서버·DB·API 키는 필요하지 않습니다. `wrangler.jsonc`와 정적 응답 헤더를 유지합니다.

Web Audio는 START 사용자 동작 후 활성화되며 기본 ON입니다. 오디오 미지원에서도 게임은 계속됩니다. 외부 음원은 사용하지 않으며 Google Fonts는 선택적 글꼴입니다. 크레딧은 현재 실행의 보상이며 영구 지갑은 후속 확장 대상입니다.
