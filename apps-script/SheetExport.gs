/**
 * 내 맘대로 단어장 — 학생 구글 시트 만들기 (Google Apps Script)
 *
 * 지문 서버(Code.gs)와는 다른, 새 Apps Script 프로젝트로 만든다.
 * 웹 앱으로 배포할 때:
 *   - 다음 사용자 인증 정보로 실행: 웹 앱에 액세스하는 사용자
 *   - 액세스 권한이 있는 사용자: (학교 도메인) 내의 모든 사용자
 * 그러면 학생 본인의 계정으로 실행되어, 학생 드라이브에 단어장 시트가 만들어진다.
 *
 * 단어장 앱이 ?d=(gzip+base64url JSON) 또는 ?p=(base64url JSON) 으로
 * { title, name, book, rows: [[영어, 한국어 뜻], ...] } 를 보낸다.
 * 학생마다 시트 파일 하나("홍길동 단어장")에 지문별 탭을 만든다.
 * 같은 지문을 다시 보내면 그 탭만 최신 내용으로 바뀐다.
 */

function doGet(e) {
  const p = (e && e.parameter) || {};
  if (!p.d && !p.p) {
    return page_('내 맘대로 단어장', '<p>단어장 앱에서 <b>[구글 시트로 보내기]</b>를 눌러 주세요.</p>');
  }

  let data;
  try {
    data = decode_(p.d || p.p, !!p.d);
  } catch (err) {
    return page_('오류', '<p>단어장 내용을 읽지 못했어요. 단어장 앱에서 다시 눌러 주세요.</p>');
  }

  const title = clean_(data.title || '', 200);
  const name = clean_(data.name || '', 30);
  const fileName = clean_(data.book || (name ? name + ' 단어장' : '내 단어장'), 100);
  const tabName = tabName_(title || '단어장');
  const rows = (Array.isArray(data.rows) ? data.rows : []).slice(0, 1000).map(function (r) {
    return [text_(clean_(r[0], 200)), text_(clean_(r[1], 500))];
  });

  const ss = openOrCreate_(fileName);
  let sh = ss.getSheetByName(tabName);
  if (!sh) {
    const sheets = ss.getSheets();
    // 새 파일의 빈 기본 탭('시트1')은 첫 지문 탭으로 쓴다
    if (sheets.length === 1 && sheets[0].getLastRow() === 0) {
      sh = sheets[0].setName(tabName);
    } else {
      sh = ss.insertSheet(tabName, sheets.length);
    }
  }
  sh.clear();

  const values = [
    [text_(title + ' 단어장'), ''],
    [name ? text_('이름: ' + name) : '', ''],
    ['', ''],
    ['영어', '한국어 뜻'],
  ].concat(rows);
  sh.getRange(1, 1, values.length, 2).setValues(values);
  sh.getRange('A1').setFontWeight('bold').setFontSize(14);
  sh.getRange(4, 1, 1, 2).setFontWeight('bold').setBackground('#e8f0fe');
  sh.setColumnWidth(1, 180);
  sh.setColumnWidth(2, 380);
  sh.setFrozenRows(4);
  SpreadsheetApp.flush();

  const url = ss.getUrl() + '#gid=' + sh.getSheetId(); // 방금 채운 탭으로 바로 열기
  return page_('단어장 시트 완성', ''
    + '<p style="font-size:18px">✅ <b>' + esc_(fileName) + '</b>의 <b>' + esc_(tabName) + '</b> 탭에 단어 ' + rows.length + '개를 넣었어요.</p>'
    + '<p><a href="' + esc_(url) + '" target="_top" style="display:inline-block;padding:14px 22px;background:#1a73e8;color:#fff;'
    + 'border-radius:10px;text-decoration:none;font-size:18px;font-weight:bold">내 구글 시트 열기</a></p>'
    + '<p style="color:#666">내 구글 드라이브에 저장되어 언제든 열어 고칠 수 있어요. 이 탭은 닫아도 돼요.</p>');
}

// 탭 이름에 못 쓰는 글자를 빼고 100자 이내로
function tabName_(s) {
  return String(s).replace(/[\[\]\*\?:\/\\']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || '단어장';
}

// 학생별로 파일 이름 → 시트 파일 id를 기억해 두고, 같은 이름이면 같은 파일을 다시 쓴다
function openOrCreate_(fileName) {
  const props = PropertiesService.getUserProperties();
  const key = 'book:' + fileName;
  const id = props.getProperty(key);
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) { /* 지워졌으면 새로 만든다 */ }
  }
  const ss = SpreadsheetApp.create(fileName);
  props.setProperty(key, ss.getId());
  return ss;
}

function decode_(s, gz) {
  while (s.length % 4) s += '=';
  const bytes = Utilities.base64DecodeWebSafe(s);
  const json = gz
    ? Utilities.ungzip(Utilities.newBlob(bytes, 'application/x-gzip')).getDataAsString('UTF-8')
    : Utilities.newBlob(bytes).getDataAsString('UTF-8');
  return JSON.parse(json);
}

function clean_(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, max); }

// =, +, -, @ 로 시작하면 수식으로 바뀌지 않도록 글자로 표시
function text_(s) { return /^[=+\-@]/.test(s) ? "'" + s : s; }

function esc_(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function page_(title, body) {
  return HtmlService.createHtmlOutput(
    '<div style="font-family:sans-serif;max-width:560px;margin:40px auto;padding:0 16px;line-height:1.6">'
    + '<h2>📘 ' + esc_(title) + '</h2>' + body + '</div>')
    .setTitle(title)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}
