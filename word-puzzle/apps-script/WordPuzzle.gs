/**
 * 낱말 조각 공방 — 문제 저장 + 학생 명단 (Google Apps Script)
 *
 * 새 구글 시트 → [확장 프로그램 → Apps Script]에 이 코드를 붙여 넣는다.
 * 시트에 '문제' 탭과 '결과' 탭이 자동으로 만들어진다.
 *
 * - GET  ?action=list          : 저장한 문제 목록 (누구나)
 * - GET  ?action=set&id=...    : 문제 하나 (학생 게임이 읽어 감)
 * - POST {action:'result'}     : 학생이 다 끝내면 이름·점수 한 줄 추가 (비밀번호 없음)
 * - POST {action:'save'}       : 문제 저장 (교사 비밀번호)
 * - POST {action:'delete'}     : 문제 삭제 (교사 비밀번호)
 * - POST {action:'results'}    : 문제별 명단 보기 (교사 비밀번호)
 *
 * 교사 비밀번호는 코드에 적지 않는다.
 * [프로젝트 설정 → 스크립트 속성]에 TEACHER_PASSWORD 로 넣는다.
 *
 * 배포: [배포 → 새 배포 → 웹 앱]
 *   - 다음 사용자 인증 정보로 실행: 나
 *   - 액세스 권한이 있는 사용자: 모든 사용자
 */

const SETS = '문제';
const SETS_HEADER = ['id', 'title', 'data', 'updated'];
const RESULTS = '결과';
const RESULTS_HEADER = ['time', 'setId', 'setTitle', 'name', 'miss', 'stars', 'seconds', 'words'];

function tab_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(header);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// 시트가 글을 수식·숫자·날짜로 바꾸지 않도록 앞에 보이지 않는 문자(ZWSP)를 붙여 저장하고, 읽을 때 뗀다.
const ZW = '​';
function safe_(s) { return ZW + String(s == null ? '' : s); }
function plain_(v) { return String(v).replace(/^​/, ''); }
function clean_(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }

function sets_() {
  return tab_(SETS, SETS_HEADER).getDataRange().getValues().slice(1)
    .filter(function (r) { return r[0]; })
    .map(function (r) { return { id: String(r[0]), title: plain_(r[1]), data: plain_(r[2]), updated: String(r[3]) }; });
}

function results_() {
  return tab_(RESULTS, RESULTS_HEADER).getDataRange().getValues().slice(1)
    .filter(function (r) { return r[1]; })
    .map(function (r) {
      return { time: r[0] instanceof Date ? r[0].toISOString() : String(r[0]), setId: String(r[1]), name: plain_(r[3]),
        miss: Number(r[4]) || 0, stars: Number(r[5]) || 0, seconds: Number(r[6]) || 0 };
    });
}

function doGet(e) {
  const p = (e && e.parameter) || {};
  try {
    if (p.action === 'set') {
      const s = sets_().filter(function (x) { return x.id === String(p.id); })[0];
      if (!s) return json_({ ok: false, error: '문제를 찾지 못했어요. 선생님께 링크를 다시 받아 주세요.' });
      return json_({ ok: true, set: s });
    }
    // 목록: 단어 수와 제출 인원만 (명단 자체는 비밀번호 필요)
    const counts = {};
    results_().forEach(function (r) { counts[r.setId] = (counts[r.setId] || 0) + 1; });
    const list = sets_().map(function (s) {
      let words = 0;
      try { words = JSON.parse(s.data).items.length; } catch (err) {}
      return { id: s.id, title: s.title, updated: s.updated, words: words, done: counts[s.id] || 0 };
    }).reverse();
    return json_({ ok: true, sets: list });
  } catch (err) {
    return json_({ ok: false, error: '오류: ' + err.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const req = JSON.parse(e.postData.contents);

    // 학생 결과: 비밀번호 없이 한 줄 추가
    if (req.action === 'result') {
      const s = sets_().filter(function (x) { return x.id === String(req.id); })[0];
      if (!s) return json_({ ok: false, error: '문제를 찾지 못했어요.' });
      const name = clean_(req.name, 30);
      if (!name) return json_({ ok: false, error: '이름이 없어요.' });
      tab_(RESULTS, RESULTS_HEADER).appendRow([new Date(), s.id, safe_(s.title), safe_(name),
        Math.max(0, Math.min(999, Number(req.miss) || 0)), Math.max(0, Math.min(3, Number(req.stars) || 0)),
        Math.max(0, Math.min(86400, Number(req.seconds) || 0)), Math.max(0, Math.min(50, Number(req.words) || 0))]);
      return json_({ ok: true });
    }

    const pw = PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD');
    if (!pw) return json_({ ok: false, error: '스크립트 속성에 TEACHER_PASSWORD가 없어요.' });
    if (req.password !== pw) return json_({ ok: false, error: '교사 비밀번호가 틀렸어요.' });

    const sh = tab_(SETS, SETS_HEADER);
    const ids = sh.getDataRange().getValues().map(function (r) { return String(r[0]); });
    const rowOf = function (id) { const i = ids.indexOf(String(id)); return i > 0 ? i + 1 : -1; };

    if (req.action === 'save') {
      JSON.parse(req.data); // 형식 확인
      const id = req.id && rowOf(req.id) > 0 ? String(req.id) : 'w' + Utilities.getUuid().slice(0, 8);
      const row = [id, safe_(clean_(req.title, 200)), safe_(req.data), new Date().toISOString()];
      const r = rowOf(id);
      if (r > 0) sh.getRange(r, 1, 1, row.length).setValues([row]);
      else sh.appendRow(row);
      return json_({ ok: true, id: id });
    }

    if (req.action === 'delete') {
      const r = rowOf(req.id);
      if (r > 0) sh.deleteRow(r);
      return json_({ ok: true });
    }

    if (req.action === 'results') {
      const list = results_().filter(function (r) { return r.setId === String(req.id); });
      return json_({ ok: true, results: list });
    }

    return json_({ ok: false, error: '알 수 없는 요청이에요.' });
  } catch (err) {
    return json_({ ok: false, error: '오류: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}
