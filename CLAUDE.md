# npm 패키지 조회

npm 패키지 이름 1개를 입력하면 버전, 설명, 라이선스, 의존성, 주간 다운로드 수를 보여주는 **HTML + CSS + JS 3개 파일짜리** 페이지.

## 프로젝트 목표
- npm에 올라온 모든 패키지의 정보를 이름으로 빠르게 확인하는 조회 도구 (예: `react`, `express`, `lodash`)
- 빌드 도구와 프레임워크 없이 `index.html`, `style.css`, `app.js`만으로 동작
- 키 없이 호출 가능한 npm 공개 API만 사용
- 학습 포인트: 여러 API를 동시에 호출(`Promise.all`)하고, 결과를 한 화면에 정리해 보여주기

## 기술 스택
- HTML, CSS, JavaScript (바닐라)
- 구조는 `index.html`, 스타일은 `style.css`, 동작은 `app.js`로 나눠 작성한다
- 외부 라이브러리와 CDN은 사용하지 않는다
- 데이터: npm Registry API, npm Downloads API (인증 없음)
- 배포: Netlify (GitHub 저장소 연결, `main` 브랜치 push 시 자동 배포)

## 파일 구조
```
(현재 작업 폴더)/
├── index.html   # 화면 구조(HTML)만 작성
├── style.css    # 스타일
├── app.js       # API 호출, 데이터 가공, 화면 그리기
└── CLAUDE.md
```
- 이 3개 파일 외에 다른 파일(폴더, 추가 JS/CSS)을 만들지 않는다. 더 필요하면 먼저 사용자에게 묻는다.
- `index.html`에는 `<link rel="stylesheet" href="style.css">`와 `<script src="app.js" defer></script>`만 연결한다. `<style>`, `<script>` 안에 코드를 직접 쓰지 않는다.
- `app.js`는 기능별로 주석 구분선을 둔다.

## 사용하는 API
| 용도 | 엔드포인트 |
|---|---|
| 패키지 정보 | `GET https://registry.npmjs.org/{패키지명}/latest` |
| 주간 다운로드 | `GET https://api.npmjs.org/downloads/point/last-week/{패키지명}` |
| 이름 추천 검색 | `GET https://registry.npmjs.org/-/v1/search?size=10&text={검색어}` (CORS 허용, 키 불필요 확인함) |

- 패키지 하나당 요청 2개를 `Promise.all`로 한꺼번에 보낸다.
- 사용할 필드 (실제 응답으로 확인 후 사용): `name`, `version`, `description`, `license`, `dependencies`(객체, 키 개수를 센다), 다운로드 응답의 `downloads`
- `dependencies` 필드가 없는 패키지는 0개로 처리한다.
- 확인되지 않은 사항 (구현 전 직접 테스트하고 결과를 이 파일에 기록한다):
  - 브라우저에서 위 두 주소를 직접 호출할 때 CORS 에러가 나는지
  - `@babel/core`처럼 `@`가 붙은 패키지의 주소 표기 방식 (`@` 그대로 vs `%2F` 인코딩)
  - 호출 한도
- **확인 결과 (2026-10-21 직접 호출)**:
  - CORS: 두 API 모두 `Access-Control-Allow-Origin: *` 응답 → 브라우저에서 직접 호출 가능
  - `@` 패키지: `@babel/core`와 `%40babel%2Fcore` 모두 200 → `encodeURIComponent(name)` 사용으로 결정
  - 404: registry는 본문 `"Not Found"`, downloads는 JSON 에러. 둘 다 상태 코드 404로 구분
  - 호출 한도: 응답에 rate limit 헤더 없음. 일반적인 사용량에서는 문제 없음 (공식 한도 수치는 미확인)

## 구현할 기능
1. 패키지 이름 입력창 1개 + 조회 버튼 (Enter 키로도 실행). 입력하면 npm 전체 검색 결과를 드롭다운(`datalist`)으로 추천하고, 입력이 비면 기본 인기 목록을 보여준다. 추천에 없는 이름도 직접 입력해 조회할 수 있다
2. 정보 카드: 이름, 최신 버전, 설명(구글 번역 링크 포함), 라이선스, 주간 다운로드 수, 의존성 개수와 이름 목록
3. 의존성 이름은 칩 형태로 나열한다
4. 다운로드 수는 천 단위 쉼표로 표시 (`toLocaleString`)
5. 각 패키지 이름을 npm 페이지(`https://www.npmjs.com/package/{패키지명}`) 링크로 연결
6. 상태 표시: 로딩 중, 에러

## 에러 처리 규칙
| 상황 | 처리 |
|---|---|
| 404 | "{패키지명} 패키지를 찾을 수 없어요" 표시 |
| 네트워크 또는 CORS 오류 | "데이터를 불러오지 못했어요. 네트워크 연결을 확인해 주세요" 표시 |
| 빈 입력 | 요청을 보내지 않고 입력창에 안내 표시 |

- 모든 `fetch`는 `try/catch`로 감싸고, `res.ok`를 확인한 뒤 `res.json()`을 호출한다.
- 에러가 나도 이전 결과는 지워진다.

## 코드 규칙
- 변수명, 함수명은 영어 camelCase, 화면에 보이는 문구와 주석은 한국어
- `var` 대신 `const`/`let`, `async/await` 사용
- 함수는 역할별로 나눈다: `fetchPackageInfo`, `fetchWeeklyDownloads`, `loadPackage`, `renderPackage`, `showError`
- 유저 입력과 API 응답 값을 화면에 넣을 때는 `textContent`를 쓴다. `innerHTML`에 그대로 넣지 않는다 (XSS 방지: 악성 스크립트가 화면에서 실행되는 공격).
- 입력값은 `trim()` 후 사용하고, URL에 넣을 때는 `encodeURIComponent` 사용 여부를 `@` 패키지 테스트 결과에 맞춰 결정한다.
- 링크는 `target="_blank" rel="noopener noreferrer"`를 붙인다.
- 반응형: 모바일(너비 360px)에서도 가로 스크롤 없이 보여야 한다. 표가 좁으면 패키지별 카드를 위아래로 쌓는 레이아웃을 쓴다. `<meta name="viewport">`를 넣는다.

## 보안 규칙
- 이 프로젝트의 API는 키가 필요 없다. 어떤 키나 토큰도 코드에 넣지 않는다.
- `style.css`, `app.js`는 브라우저에 그대로 공개되는 파일이다. 비밀값을 넣지 않는다.

## 배포 규칙 (Netlify)
- 이 폴더의 최상위에 `index.html`이 있으면, 폴더 전체를 그대로 배포하면 된다. 별도 빌드 명령은 필요 없다.
- 폴더/파일 이름의 대소문자를 구분하는 환경이므로 `index.html`, `style.css`, `app.js`는 항상 소문자로 쓰고, HTML에서 연결할 때도 똑같이 쓴다.
- 이 폴더에는 공개돼도 되는 파일만 둔다.

## Git 규칙
- 이 폴더가 Git 저장소의 최상위다. 하위 폴더에 `.git` 폴더를 만들지 않는다 (GitHub에서 폴더가 404로 뜨는 원인이 된다).
- 다른 Git 저장소 폴더 안쪽에 이 폴더를 만들지 않는다.
- 작업 전 `git pull origin main`으로 원격 변경 사항을 먼저 받는다.
- 커밋 메시지는 한국어로 짧게 쓴다 (예: `정보 카드 추가`).
- `git push --force`는 사용자가 명시적으로 요청할 때만 쓴다.

## 작업 방식
- 새 기능은 한 번에 하나씩 추가하고, 추가할 때마다 브라우저에서 `index.html`을 열어 동작을 확인한다. 수정한 CSS/JS가 반영이 안 되면 강력 새로고침(Ctrl+F5)을 한다.
- 확인되지 않은 API 동작(응답 필드, 호출 한도, CORS 등)은 추측하지 말고 직접 호출해서 확인하거나 공식 문서를 기준으로 한다. npm API 문서는 https://github.com/npm/registry 에서 찾을 수 있다.
- 코드를 설명할 때는 어려운 용어를 초보자도 이해할 수 있게 풀어 쓴다.

## 완료 기준
- [ ] `react`를 입력하면 정보 카드가 표시된다
- [ ] 없는 패키지 이름이면 안내 문구가 표시된다
- [ ] 빈 입력이면 요청 없이 안내가 표시된다
- [ ] 로딩 중 상태가 보인다
- [ ] 모바일 화면에서 레이아웃이 깨지지 않는다
- [ ] `@`가 붙은 패키지(예: `@babel/core`) 동작 여부를 확인하고 결과를 기록했다
- [ ] Netlify 배포 주소에서 정상 동작한다