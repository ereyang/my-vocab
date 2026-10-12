/**
 * 내 맘대로 단어장 — 저장된 지문 서버 (Google Apps Script)
 *
 * 구글 시트의 '지문' 탭에 지문을 저장하고, 단어장 페이지가 읽어 간다.
 * - GET  : 모든 지문 목록을 돌려준다 (학생·교사 누구나)
 * - POST : 지문 저장/삭제 (교사 비밀번호 필요)
 *
 * 교사 비밀번호는 이 코드에 적지 않는다.
 * [프로젝트 설정 → 스크립트 속성]에 TEACHER_PASSWORD 로 넣는다.
 */

const SHEET_NAME = '지문';
const HEADER = ['id', 'title', 'text', 'gloss', 'updated'];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// 시트가 글을 수식(=, +, -, @로 시작)이나 숫자·날짜로 바꾸지 않도록
// 앞에 보이지 않는 문자(ZWSP)를 붙여 저장하고, 읽을 때 뗀다.
const ZW = '​';
function safe_(s) { return ZW + String(s || ''); }
function plain_(v) { return String(v).replace(/^​/, ''); }

function readAll_() {
  const rows = sheet_().getDataRange().getValues().slice(1);
  return rows
    .filter(function (r) { return r[0]; })
    .map(function (r) {
      return { id: String(r[0]), title: plain_(r[1]), text: plain_(r[2]), gloss: plain_(r[3]), updated: String(r[4]) };
    });
}

function doGet() {
  return json_({ ok: true, passages: readAll_() });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const req = JSON.parse(e.postData.contents);
    const pw = PropertiesService.getScriptProperties().getProperty('TEACHER_PASSWORD');
    if (!pw) return json_({ ok: false, error: '스크립트 속성에 TEACHER_PASSWORD가 없어요.' });
    if (req.password !== pw) return json_({ ok: false, error: '교사 비밀번호가 틀렸어요.' });

    const sh = sheet_();
    const ids = sh.getDataRange().getValues().map(function (r) { return String(r[0]); });
    const rowOf = function (id) { const i = ids.indexOf(String(id)); return i > 0 ? i + 1 : -1; };

    if (req.action === 'save') {
      const id = req.id && rowOf(req.id) > 0 ? String(req.id) : 'p' + Utilities.getUuid().slice(0, 8); // 'p'를 붙여 숫자로 바뀌지 않게
      const row = [id, safe_(req.title), safe_(req.text), safe_(req.gloss), new Date().toISOString()];
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

    return json_({ ok: false, error: '알 수 없는 요청이에요.' });
  } catch (err) {
    return json_({ ok: false, error: '오류: ' + err.message });
  } finally {
    lock.releaseLock();
  }
}
