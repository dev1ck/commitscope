# Commitscope

GitLab API로 등록한 프로젝트의 원격 브랜치·태그 커밋 로그를 조회하는 Windows 데스크톱 앱 (Electron + React + TypeScript).

## 실행 / 빌드

```bash
npm install
node node_modules/electron/install.js   # npm 정책으로 Electron postinstall이 막힌 경우에만
npm run dev        # 개발 실행
npm test           # 그래프 lane 알고리즘 테스트
npm run typecheck
npm run dist       # release/ 에 설치 파일(Setup)과 portable exe 생성
```

VS Code 터미널에서는 `ELECTRON_RUN_AS_NODE=1`이 설정되어 있어 Electron이 Node로 실행될 수 있습니다. 그럴 때는 해당 환경변수를 지우고 실행하세요.

## 처음 설정

1. **GitLab 서버 설정** → 서버 URL과 Personal Access Token(`read_api` scope)을 등록합니다. 토큰은 DPAPI(`safeStorage`)로 암호화되어 `%APPDATA%\Commitscope\config.json`에 저장됩니다.
2. **+ 프로젝트 추가** → 이름이나 `group/project` 경로로 검색해서 추가합니다.

## 조회 기능

| 기능 | 방법 |
| --- | --- |
| 브랜치/태그 히스토리 | `브랜치/태그` 모드에서 ref 선택. 여러 개를 고르면 브랜치별로 받아 날짜순으로 병합 |
| 태그 ↔ 브랜치 사이 커밋 | `범위 비교`: 기준=태그, 대상=브랜치 (`from..to`, 기준 이후 대상에 추가된 커밋) |
| 모든 브랜치·태그 | `전체 브랜치` (탭을 누르면 바로 조회) |
| 기간 | 시작일 ~ 종료일 (GitLab `since`/`until`, 커밋 날짜 기준) |
| 작성자 | 이름 또는 이메일 일부 (서버에서 필터링) |
| 파일/디렉터리 경로 | 해당 경로를 변경한 커밋만 |
| 커밋 SHA로 찾기 | 현재 프로젝트에 없으면 등록된 다른 프로젝트까지 찾아서 이동 |
| 결과 내 필터 | 이미 불러온 커밋에서 메시지/SHA/작성자 검색, 작성자 다중 선택(커밋 수 표시) |
| 커밋 상세 | 전체 메시지, 작성자/커미터, 부모(클릭 이동), 포함된 브랜치·태그, 연결된 MR, 변경 파일 diff |
| 체리픽 추적 | `cherry-pick -x`로 남은 `(cherry picked from commit …)`을 읽어 목록에 `체리픽` 배지, 상세 `원본 커밋`(클릭 이동, 다른 프로젝트도 검색)과 `복사된 커밋`(이 커밋을 체리픽해 간 커밋, 불러온 목록 안에서) 표시 |
| 자동 새로고침 | 새 커밋을 NEW로 표시하고, 창이 백그라운드일 때 Windows 알림 |
| CSV 내보내기 | 현재 표시 중인(필터 적용된) 커밋. Excel 호환 UTF-8 BOM |

작성자나 경로로 걸러진 결과는 부모 커밋이 빠져 있어서 그래프 대신 목록만 표시합니다.
