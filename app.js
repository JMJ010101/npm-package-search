// ==============================
// 상수 / DOM 요소
// ==============================
const REGISTRY_URL = 'https://registry.npmjs.org';
const DOWNLOADS_URL = 'https://api.npmjs.org/downloads/point/last-week';
const NPM_PAGE_URL = 'https://www.npmjs.com/package';
const TRANSLATE_URL = 'https://translate.google.com/';

const form = document.getElementById('lookupForm');
const input = document.getElementById('packageName');
const lookupBtn = document.getElementById('lookupBtn');
const formMessage = document.getElementById('formMessage');
const statusEl = document.getElementById('status');
const resultEl = document.getElementById('result');

// ==============================
// API 호출
// ==============================
// 응답 확인 공통 처리: 404는 NOT_FOUND, 그 외 오류는 HTTP_ERROR로 구분한다
async function requestJson(url) {
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error('NOT_FOUND');
  }
  if (!res.ok) {
    throw new Error('HTTP_ERROR');
  }
  return res.json();
}

// 패키지 정보 (@babel/core 같은 이름은 encodeURIComponent로 안전하게 변환)
async function fetchPackageInfo(name) {
  return requestJson(`${REGISTRY_URL}/${encodeURIComponent(name)}/latest`);
}

// 주간 다운로드 수
async function fetchWeeklyDownloads(name) {
  const data = await requestJson(`${DOWNLOADS_URL}/${encodeURIComponent(name)}`);
  return data.downloads;
}

// ==============================
// 데이터 가공
// ==============================
// 패키지 정보 + 다운로드를 동시에 요청하고 화면용 데이터로 만든다
async function loadPackage(name) {
  const [info, downloads] = await Promise.all([
    fetchPackageInfo(name),
    fetchWeeklyDownloads(name),
  ]);

  // 오래된 패키지는 license가 객체({type})일 수 있다
  let license = info.license;
  if (license && typeof license === 'object') {
    license = license.type;
  }

  const dependencyNames = Object.keys(info.dependencies || {});

  return {
    name: info.name || name,
    version: info.version || '-',
    description: info.description || '설명 없음',
    hasDescription: Boolean(info.description),
    license: license || '정보 없음',
    dependencyNames,
    dependencyCount: dependencyNames.length,
    downloads: Number(downloads) || 0,
  };
}

// ==============================
// 화면 그리기
// ==============================
function createRow(label, value, extraClass) {
  const row = document.createElement('div');
  row.className = extraClass ? `row ${extraClass}` : 'row';
  const dt = document.createElement('dt');
  dt.textContent = label;
  const dd = document.createElement('dd');
  dd.textContent = value;
  row.append(dt, dd);
  return row;
}

// 설명 행: npm은 영어 설명만 제공하므로 구글 번역(영어→한국어)으로 여는 링크를 붙인다
function createDescriptionRow(pkg) {
  const row = createRow('설명', pkg.description);
  if (!pkg.hasDescription) return row;

  const link = document.createElement('a');
  link.className = 'translate-link';
  link.href = `${TRANSLATE_URL}?sl=en&tl=ko&op=translate&text=${encodeURIComponent(pkg.description)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = '한국어로 번역 보기';
  row.append(link);
  return row;
}

// 의존성 행: 개수와 함께 패키지 이름을 칩으로 나열한다
function createDependenciesRow(pkg) {
  const row = createRow('의존성', `${pkg.dependencyCount.toLocaleString()}개`, 'number');
  if (pkg.dependencyCount === 0) return row;

  const chips = document.createElement('ul');
  chips.className = 'chips';
  pkg.dependencyNames.forEach((depName) => {
    const li = document.createElement('li');
    li.textContent = depName;
    chips.append(li);
  });
  row.append(chips);
  return row;
}

function renderPackage(pkg) {
  const card = document.createElement('article');
  card.className = 'card';

  const title = document.createElement('h2');
  const link = document.createElement('a');
  link.href = `${NPM_PAGE_URL}/${pkg.name.split('/').map(encodeURIComponent).join('/')}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = pkg.name;
  title.append(link);

  const list = document.createElement('dl');
  list.append(
    createDescriptionRow(pkg),
    createRow('최신 버전', pkg.version, 'mono'),
    createRow('라이선스', pkg.license),
    createRow('주간 다운로드', pkg.downloads.toLocaleString(), 'number'),
    createDependenciesRow(pkg),
  );

  card.append(title, list);
  resultEl.replaceChildren(card);
}

// ==============================
// 상태 / 에러 표시
// ==============================
function showError(message) {
  formMessage.textContent = message;
  input.classList.add('invalid');
}

function clearMessages() {
  formMessage.textContent = '';
  input.classList.remove('invalid');
}

// ==============================
// 드롭다운 목록 (npm 전체 검색 추천)
// ==============================
// 입력이 비어 있으면 HTML에 적어 둔 기본 목록, 글자를 입력하면 npm 검색 결과를 보여준다
const optionsEl = document.getElementById('packageOptions');
const defaultNames = Array.from(optionsEl.querySelectorAll('option'), (option) => option.value);
const knownNames = new Set(defaultNames); // 추천으로 보여준 적 있는 이름 모음
let searchTimer = null;
let latestSearchId = 0;

function setOptions(names) {
  names.forEach((name) => knownNames.add(name));
  optionsEl.replaceChildren(
    ...names.map((name) => {
      const option = document.createElement('option');
      option.value = name;
      return option;
    }),
  );
}

// 검색 API로 이름 후보를 받아온다 (실패해도 조회 기능에는 영향 없으므로 조용히 무시)
async function searchPackageNames(text) {
  const searchId = ++latestSearchId;
  try {
    const data = await requestJson(`${REGISTRY_URL}/-/v1/search?size=10&text=${encodeURIComponent(text)}`);
    // 더 늦게 보낸 요청이 있으면 이 응답은 버린다 (오래된 결과가 덮어쓰는 것 방지)
    if (searchId !== latestSearchId) return;
    setOptions(data.objects.map((item) => item.package.name));
  } catch (error) {
    // 추천을 불러오지 못해도 직접 입력해서 조회할 수 있다
  }
}

input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const text = input.value.trim();
  if (!text) {
    latestSearchId++;
    setOptions(defaultNames);
    return;
  }
  searchTimer = setTimeout(() => searchPackageNames(text), 250);
});

// datalist는 입력값과 일치하는 항목만 보여주므로, 목록에서 고른 값이 들어 있으면
// 포커스할 때 값을 잠시 비우고 기본 목록으로 되돌려 목록이 다시 열리게 한다
input.addEventListener('focus', () => {
  if (knownNames.has(input.value)) {
    input.dataset.previousValue = input.value;
    input.value = '';
    latestSearchId++;
    setOptions(defaultNames);
  }
  try {
    input.showPicker();
  } catch (error) {
    // showPicker를 지원하지 않는 브라우저는 클릭/화살표로 열린다
  }
});

// 다른 항목을 고르지 않고 벗어나면 원래 값으로 되돌린다
input.addEventListener('blur', () => {
  if (!input.value && input.dataset.previousValue) {
    input.value = input.dataset.previousValue;
  }
  delete input.dataset.previousValue;
});

// ==============================
// 이벤트 처리
// ==============================
// form submit은 버튼 클릭과 Enter 키 입력을 모두 처리한다
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearMessages();
  resultEl.replaceChildren(); // 이전 결과 지우기

  const name = input.value.trim();
  if (!name) {
    showError('패키지 이름을 입력해 주세요');
    input.focus();
    return;
  }

  lookupBtn.disabled = true;
  statusEl.textContent = '불러오는 중...';
  try {
    renderPackage(await loadPackage(name));
  } catch (error) {
    if (error.message === 'NOT_FOUND') {
      showError(`${name} 패키지를 찾을 수 없어요`);
    } else {
      showError('데이터를 불러오지 못했어요. 네트워크 연결을 확인해 주세요');
    }
  } finally {
    statusEl.textContent = '';
    lookupBtn.disabled = false;
  }
});
