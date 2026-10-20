"use strict";
(() => {
  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const OBJECTS = { star: "별", rocket: "로켓", book: "책", magnifier: "돋보기", bulb: "전구", pencil: "연필", heart: "하트", clock: "시계", key: "열쇠", trophy: "트로피", tree: "나무", house: "집", gem: "보석", globe: "지구본", moon: "달", flower: "꽃" };
  const OBJ_KEYS = Object.keys(OBJECTS);
  const MAX_WORDS = 12;
  const DRAFT_KEY = "wordpuzzle-draft-v1";
  // ▼ 구글 Apps Script 웹 앱 주소 (배포 후 여기에 붙여 넣기)
  const API_URL = "https://script.google.com/macros/s/AKfycbwyU9VuGUg81cgPViydJUTwc_AcMVKw_JF22wfNuOrwnYiDXebcOL34W4VNJSMa8U3Q/exec";

  const SAMPLE = {
    title: "Maya and the Comet (예시)",
    passage: "Maya was curious about the night sky. Every evening she would observe the stars from her small balcony. One winter, she noticed a faint light that moved slowly across the sky. She decided to record its path in a notebook. Her teacher encouraged her to share the discovery with a local astronomy club. The members were impressed by her patience, and they helped her confirm that it was a new comet.",
    selected: ["curious", "observe", "faint", "record", "encouraged", "patience", "confirm"],
    items: [
      { word: "curious", pos: "형용사", meaning: "호기심이 많은", sentence: "The curious boy asked many questions in class.", answer: "curious", sentenceKo: "호기심 많은 소년은 수업 시간에 질문을 많이 했다.", object: "bulb" },
      { word: "observe", pos: "동사", meaning: "관찰하다", sentence: "We observe birds in the park every Sunday.", answer: "observe", sentenceKo: "우리는 매주 일요일 공원에서 새를 관찰한다.", object: "magnifier" },
      { word: "faint", pos: "형용사", meaning: "희미한", sentence: "I heard a faint sound from the kitchen.", answer: "faint", sentenceKo: "부엌에서 희미한 소리가 들렸다.", object: "moon" },
      { word: "record", pos: "동사", meaning: "기록하다", sentence: "Please record your answers on this paper.", answer: "record", sentenceKo: "이 종이에 답을 기록하세요.", object: "pencil" },
      { word: "encouraged", pos: "동사", meaning: "격려했다", sentence: "My coach encouraged me to try again.", answer: "encouraged", sentenceKo: "코치님은 내가 다시 도전하도록 격려했다.", object: "heart" },
      { word: "patience", pos: "명사", meaning: "인내심", sentence: "Learning a new language takes patience.", answer: "patience", sentenceKo: "새로운 언어를 배우는 데는 인내심이 필요하다.", object: "clock" },
      { word: "confirm", pos: "동사", meaning: "확인하다", sentence: "Can you confirm the time of the meeting?", answer: "confirm", sentenceKo: "회의 시간을 확인해 줄 수 있나요?", object: "key" },
    ],
  };

  const params = new URLSearchParams(location.search);
  const SET_ID = params.get("set");
  const STUDENT = !!SET_ID;
  let draft = store.get(DRAFT_KEY);
  if (!draft || !Array.isArray(draft.items) || typeof draft.passage !== "string") draft = clone(SAMPLE);
  if (!Array.isArray(draft.selected)) draft.selected = draft.items.map((i) => i.word.toLowerCase());
  const saveDraft = () => store.set(DRAFT_KEY, draft);

  const API = {
    ready: () => !!API_URL,
    async get(q) {
      const res = await fetch(API_URL + "?" + new URLSearchParams(q), { cache: "no-store" });
      const j = await res.json(); if (!j.ok) throw new Error(j.error || "불러오지 못했어요."); return j;
    },
    async post(body) {
      const res = await fetch(API_URL, { method: "POST", body: JSON.stringify(body) });
      const j = await res.json(); if (!j.ok) throw new Error(j.error || "저장하지 못했어요."); return j;
    },
  };
  const getPw = () => { try { return sessionStorage.getItem("wp-pw") || ""; } catch { return ""; } };
  const setPw = (v) => { try { sessionStorage.setItem("wp-pw", v); } catch {} };

  /* ---------- text tools ---------- */
  function tokenize(text) {
    const out = []; const re = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g; let last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push({ t: text.slice(last, m.index) });
      out.push({ t: m[0], w: true, i: m.index });
      last = m.index + m[0].length;
    }
    if (last < text.length) out.push({ t: text.slice(last) });
    return out;
  }
  function sentenceAt(text, idx) {
    let s = idx; while (s > 0 && !/[.!?\n]/.test(text[s - 1])) s--;
    let e = idx; while (e < text.length && !/[.!?\n]/.test(text[e])) e++;
    if (e < text.length && text[e] !== "\n") e++;
    return text.slice(s, e).trim();
  }
  function findAnswer(sentence, answer) {
    if (!sentence || !answer) return null;
    const m = new RegExp("(^|[^A-Za-z])(" + escRe(answer) + ")(?![A-Za-z])", "i").exec(sentence);
    return m ? { index: m.index + m[1].length, text: m[2] } : null;
  }
  function fixItem(it, i) {
    it.word = String(it.word || "").trim();
    for (const k of ["pos", "meaning", "sentence", "answer", "sentenceKo"]) it[k] = String(it[k] ?? "").trim();
    if (!it.answer) it.answer = it.word;
    let f = findAnswer(it.sentence, it.answer) || findAnswer(it.sentence, it.word);
    if (f) it.answer = f.text;
    if (!OBJ_KEYS.includes(it.object)) it.object = OBJ_KEYS[i % OBJ_KEYS.length];
    return it;
  }
  function itemProblems(it) {
    const p = [];
    if (!it.meaning) p.push("문맥상 뜻을 적어 주세요.");
    if (!it.sentence) p.push("예문을 적어 주세요.");
    else if (!findAnswer(it.sentence, it.answer)) p.push("빈칸 정답이 예문 속에 그대로 있어야 해요.");
    return p;
  }

  /* ---------- shell ---------- */
  const LOGO = `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M6 6h11a4 4 0 1 1 6 0h11v11a4 4 0 1 0 0 6v11H23a4 4 0 1 0-6 0H6V23a4 4 0 1 1 0-6z" fill="var(--pop)" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round"/></svg>`;
  $("#app").innerHTML = `
  <header class="top">
    <div class="brand">${LOGO}<h1>낱말 조각 공방</h1></div>
    <nav class="tabs" id="tabs" role="tablist">
      <button role="tab" id="tab-setup" data-view="setup">출제</button>
      <button role="tab" id="tab-saved" data-view="saved">내 문제·명단</button>
      <button role="tab" id="tab-game" data-view="game">미리보기</button>
    </nav>
  </header>
  <p class="notice" id="api-notice" hidden>아직 구글 시트가 연결되지 않았어요. 문제 저장과 학생 명단은 연결 후에 쓸 수 있어요. 안내는 <b>README</b>에 있어요.</p>

  <section id="view-setup" class="view stack">
    <div class="setup-top">
      <article class="panel">
        <div class="panel-head"><span class="step">1</span><h2>지문 넣기</h2><button class="btn link push" id="new-set">새 문제 만들기</button></div>
        <input id="title" class="title-input" placeholder="지문 제목 (예: 3과 본문 1)" autocomplete="off">
        <textarea id="passage" rows="9" placeholder="영어 지문을 붙여 넣으세요." spellcheck="false"></textarea>
        <div class="row">
          <label class="btn" for="file">텍스트 파일 불러오기</label>
          <input type="file" id="file" accept=".txt,text/plain" hidden>
          <span class="status" id="file-status"></span>
        </div>
      </article>
      <article class="panel">
        <div class="panel-head"><span class="step">2</span><h2>출제할 단어 고르기</h2><span class="pill" id="sel-count"></span></div>
        <p class="hint">지문 속 단어를 눌러 고르세요. 다시 누르면 빠져요. 최대 ${MAX_WORDS}개.</p>
        <div id="picker" class="picker"></div>
      </article>
    </div>
    <article class="panel">
      <div class="panel-head"><span class="step">3</span><h2>AI로 문맥상 뜻·예문 만들기</h2></div>
      <ol class="how">
        <li><button class="btn primary" id="copy-prompt">AI에게 보낼 질문 복사</button> <span class="status" id="prompt-status"></span></li>
        <li>Claude(또는 다른 AI) 대화창에 붙여 넣고 보내기</li>
        <li>AI가 준 답(코드)을 통째로 복사해 아래에 붙여 넣고 <b>적용</b></li>
      </ol>
      <textarea id="paste" class="paste" rows="4" placeholder="AI 답을 여기에 붙여 넣으세요. Claude 앱 페이지의 '깃허브로 내보내기' 코드도 여기에 넣으면 돼요." spellcheck="false"></textarea>
      <div class="row"><button class="btn" id="apply-paste">적용</button><span class="status" id="paste-status"></span></div>
    </article>
    <article class="panel">
      <div class="panel-head"><span class="step">4</span><h2>문제 확인·수정</h2></div>
      <p class="hint">뜻과 쉬운 예문을 고칠 수 있어요. 2단계에서는 예문 속 '빈칸 정답'이 빈칸이 됩니다.</p>
      <div id="items" class="items"></div>
    </article>
    <article class="panel">
      <div class="panel-head"><span class="step">5</span><h2>저장하고 학생 링크 만들기</h2></div>
      <div class="row">
        <input type="password" id="pw" class="title-input pw" placeholder="교사 비밀번호" autocomplete="current-password">
        <button class="btn" id="play">미리 해 보기</button>
        <button class="btn" id="save-over" hidden>이 문제에 덮어쓰기</button>
        <button class="btn primary" id="save">새 문제로 저장하고 링크 만들기</button>
      </div>
      <span class="status" id="save-status"></span>
      <div class="linkbox" id="linkbox" hidden></div>
    </article>
  </section>

  <section id="view-saved" class="view stack">
    <article class="panel">
      <div class="panel-head"><h2>저장한 문제</h2><button class="btn small push" id="reload-sets">새로고침</button></div>
      <div id="sets" class="sets"></div>
    </article>
    <article class="panel" id="roster-panel">
      <div class="panel-head"><h2 id="roster-title">명단</h2><span class="pill" id="roster-count"></span><button class="btn small push" id="reload-roster" hidden>새로고침</button></div>
      <div class="row"><input type="password" id="pw2" class="title-input pw" placeholder="교사 비밀번호" autocomplete="current-password"><span class="status" id="roster-status">위 목록에서 '명단 보기'를 누르세요.</span></div>
      <div class="table-wrap"><table class="roster" id="roster" hidden><thead><tr><th>이름</th><th>끝낸 시각</th><th>걸린 시간</th><th>실수</th><th>별</th></tr></thead><tbody></tbody></table></div>
    </article>
  </section>

  <section id="view-game" class="view stack">
    <div class="gate" id="gate" hidden>
      <article class="panel gate-card">
        <h2 class="gate-title" id="gate-title">낱말 조각 공방</h2>
        <p class="hint" id="gate-sub">이름을 적고 시작하세요. 다 끝내면 선생님께 자동으로 제출돼요.</p>
        <label class="field"><span class="lbl2">이름 (또는 학번 이름)</span><input id="student-name" class="title-input" placeholder="예: 20315 김민지" autocomplete="name" maxlength="30"></label>
        <button class="btn primary big" id="gate-go">시작하기</button>
        <span class="status" id="gate-status"></span>
      </article>
    </div>
    <div id="game-body" class="stack">
    <div class="game-head">
      <div class="stepper"><span id="st1">1 · 짝 맞추고 퍼즐 완성</span><span id="st2">2 · 빈칸 채우고 3D 모으기</span></div>
      <div class="game-meta"><span class="game-title" id="g-title"></span><span class="pill" id="g-name" hidden></span><span class="pill" id="g-miss">실수 0</span><button class="btn small" id="restart">처음부터</button></div>
    </div>
    <div class="done" id="done" hidden></div>

    <div id="stage1" class="stage">
      <article class="panel">
        <div class="panel-head"><h2>영어 ↔ 우리말 짝 맞추기</h2><span class="pill" id="match-count"></span></div>
        <p class="hint">영어 단어와 문맥상 뜻을 하나씩 누르세요. 맞히면 퍼즐 조각이 생겨요.</p>
        <div class="match">
          <div class="col" id="col-en"><span class="col-label">ENGLISH</span></div>
          <div class="col" id="col-ko"><span class="col-label">우리말 뜻</span></div>
        </div>
        <div class="sentence-card" id="sent-card"><span class="lbl">문장</span><p class="ko">짝을 맞히면 그 단어가 들어간 쉬운 문장이 여기 나와요.</p></div>
      </article>
      <article class="panel">
        <div class="panel-head"><h2>2D 퍼즐</h2><span class="pill" id="puzzle-count"></span></div>
        <p class="hint">아래 조각 상자의 조각을 끌어서 그림 위 제자리에 놓으세요.</p>
        <div class="puzzle-host" id="puzzle-host"><div class="pstage" id="pstage"><canvas id="board"></canvas><div class="tray-bg" id="tray-bg"><span>조각 상자</span></div></div></div>
        <button class="btn primary big" id="to-stage2" hidden>다음 단계: 빈칸 채우기 →</button>
      </article>
    </div>

    <div id="stage2" class="stage two" hidden>
      <article class="panel">
        <div class="panel-head"><h2>빈칸에 알맞은 단어</h2><span class="pill" id="blank-count"></span></div>
        <p class="hint">단어 카드를 누른 다음 빈칸을 누르세요. 맞히면 3D 물건이 진열장에 나와요.</p>
        <div class="bank" id="bank"></div>
        <ol class="blanks" id="blanks"></ol>
      </article>
      <article class="panel shelf-panel">
        <div class="panel-head"><h2>3D 진열장</h2><span class="hint" style="margin-left:auto">끌어서 돌려 보세요</span></div>
        <div class="three-host" id="three-host"><canvas id="three"></canvas><div class="three-empty" id="three-empty">빈칸을 맞히면 물건이 하나씩 나타나요.</div><div class="three-msg" id="three-msg"></div></div>
        <ul class="collected" id="collected"></ul>
      </article>
    </div>
    </div>
  </section>`;

  /* ---------- view switching ---------- */
  let view = null;
  function showView(v) {
    view = v;
    for (const k of ["setup", "saved", "game"]) {
      $("#view-" + k).hidden = v !== k;
      $("#tab-" + k).setAttribute("aria-selected", v === k);
    }
    if (v === "game" && !STUDENT) {
      if (!G) startGame(validSet(draft) || SAMPLE);
      else requestAnimationFrame(layoutPuzzle);
    }
    if (v === "saved") loadSets();
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-view]"); if (b) showView(b.dataset.view); });

  /* ---------- setup: passage & picker ---------- */
  const passageEl = $("#passage"), titleEl = $("#title");
  function fillSetupFields() { passageEl.value = draft.passage; titleEl.value = draft.title || ""; }
  fillSetupFields();

  function wordsInPassage() {
    const seen = new Map();
    for (const tk of tokenize(draft.passage)) if (tk.w) { const k = tk.t.toLowerCase(); if (!seen.has(k)) seen.set(k, tk); }
    return seen;
  }
  function renderPicker() {
    const sel = new Set(draft.selected);
    const pk = $("#picker");
    pk.innerHTML = tokenize(draft.passage).map((tk) => tk.w
      ? `<button type="button" class="tok${sel.has(tk.t.toLowerCase()) ? " on" : ""}" data-w="${esc(tk.t.toLowerCase())}">${esc(tk.t)}</button>`
      : esc(tk.t)).join("");
    pk.classList.toggle("full", sel.size >= MAX_WORDS);
    $("#sel-count").textContent = `${sel.size} / ${MAX_WORDS}`;
  }
  function pendingWords() {
    const have = new Set(draft.items.map((i) => i.word.toLowerCase()));
    return draft.selected.filter((w) => !have.has(w));
  }
  function orderSelected() {
    const order = [...wordsInPassage().keys()];
    draft.selected = draft.selected.filter((w) => order.includes(w)).sort((a, b) => order.indexOf(a) - order.indexOf(b));
    const sel = new Set(draft.selected);
    draft.items = draft.items.filter((i) => sel.has(i.word.toLowerCase()))
      .sort((a, b) => order.indexOf(a.word.toLowerCase()) - order.indexOf(b.word.toLowerCase()));
  }
  $("#picker").addEventListener("click", (e) => {
    const b = e.target.closest(".tok"); if (!b) return;
    const w = b.dataset.w; const i = draft.selected.indexOf(w);
    if (i >= 0) draft.selected.splice(i, 1);
    else if (draft.selected.length >= MAX_WORDS) { setStatus("#prompt-status", `최대 ${MAX_WORDS}개까지 고를 수 있어요.`, "err"); return; }
    else draft.selected.push(w);
    orderSelected(); saveDraft(); renderPicker(); renderItems();
  });
  let pTimer;
  passageEl.addEventListener("input", () => {
    clearTimeout(pTimer);
    pTimer = setTimeout(() => { draft.passage = passageEl.value; orderSelected(); saveDraft(); renderPicker(); renderItems(); }, 250);
  });
  titleEl.addEventListener("input", () => { draft.title = titleEl.value; saveDraft(); });
  $("#new-set").addEventListener("click", () => {
    draft = { title: "", passage: "", selected: [], items: [], id: null };
    saveDraft(); fillSetupFields(); renderPicker(); renderItems(); $("#linkbox").hidden = true; setStatus("#save-status", "");
    passageEl.focus();
  });

  function setStatus(sel, html, kind = "") { const s = $(sel); s.className = "status" + (kind ? " " + kind : ""); s.innerHTML = html; }

  $("#file").addEventListener("change", (e) => {
    const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
    const r = new FileReader();
    r.onload = () => { passageEl.value = String(r.result); draft.passage = passageEl.value; draft.selected = []; draft.items = []; saveDraft(); renderPicker(); renderItems(); setStatus("#file-status", `'${esc(f.name)}' 파일을 불러왔어요.`, "good"); };
    r.onerror = () => setStatus("#file-status", "파일을 읽지 못했어요. .txt 파일인지 확인해 주세요.", "err");
    r.readAsText(f);
  });

  /* ---------- AI prompt copy / paste ---------- */
  function buildPrompt(words) {
    const pos = wordsInPassage();
    const list = words.map((w) => pos.get(w)?.t || w);
    const ex = list[0] || "observe";
    return `아래 영어 지문으로 고등학생 단어 게임을 만들려고 해.

[지문]
${draft.passage.trim().slice(0, 12000)}

[단어] ${list.join(", ")}

단어마다 아래 모양으로 채워서, JSON 배열 하나만 코드 블록으로 답해 줘. 다른 설명은 쓰지 마.
[{"word":"${ex}","pos":"품사","meaning":"지문 속 뜻","sentence":"쉬운 새 영어 문장","answer":"${ex}","sentenceKo":"문장 해석","object":"book"}]

- meaning: 이 지문 문맥에 맞는 우리말 뜻 하나, 짧게
- sentence: 같은 뜻으로 쓴 쉬운 새 문장 (6~12단어, 지문 문장 복사 금지)
- answer: sentence 속에 들어간 그 단어의 철자 그대로
- object: ${OBJ_KEYS.join(", ")} 중 뜻과 어울리는 것 하나`;
  }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.append(ta); ta.select();
      let ok = false; try { ok = document.execCommand("copy"); } catch {} ta.remove(); return ok;
    }
  }
  $("#copy-prompt").addEventListener("click", async () => {
    const words = pendingWords().length ? pendingWords() : draft.selected.slice();
    if (!words.length) { setStatus("#prompt-status", "먼저 2번에서 단어를 골라 주세요.", "err"); return; }
    const ok = await copyText(buildPrompt(words));
    setStatus("#prompt-status", ok ? `${words.length}개 단어 질문을 복사했어요. AI 대화창에 붙여 넣으세요.` : "복사가 안 됐어요. 다른 브라우저로 열어 주세요.", ok ? "good" : "err");
  });
  function extractJson(text) {
    const t = text.trim();
    try { return JSON.parse(t); } catch {}
    const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
    if (fence) { try { return JSON.parse(fence[1]); } catch {} }
    const a = t.search(/[[{]/), b = Math.max(t.lastIndexOf("]"), t.lastIndexOf("}"));
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
    return null;
  }
  $("#apply-paste").addEventListener("click", () => {
    const data = extractJson($("#paste").value);
    if (!data) { setStatus("#paste-status", "답을 읽지 못했어요. AI 답 전체(코드 부분)를 그대로 붙여 넣어 주세요.", "err"); return; }
    if (!Array.isArray(data) && Array.isArray(data.items)) {
      // a whole set exported from the Claude page
      draft = { id: null, title: String(data.title || ""), passage: String(data.passage || ""), items: data.items.map((it, i) => fixItem({ ...it }, i)), selected: [] };
      draft.selected = draft.items.map((i) => i.word.toLowerCase());
      orderSelected(); saveDraft(); fillSetupFields(); renderPicker(); renderItems();
      $("#paste").value = ""; setStatus("#paste-status", `문제 ${draft.items.length}개를 불러왔어요.`, "good"); return;
    }
    const arr = Array.isArray(data) ? data : [];
    const pos = wordsInPassage(); let n = 0;
    for (const r of arr) {
      const w = String(r?.word || "").toLowerCase();
      if (!w || !draft.selected.includes(w)) continue;
      const it = fixItem({ ...r, word: pos.get(w)?.t || r.word }, draft.items.length);
      draft.items = draft.items.filter((i) => i.word.toLowerCase() !== w); draft.items.push(it); n++;
    }
    orderSelected(); saveDraft(); renderPicker(); renderItems();
    if (n) { $("#paste").value = ""; setStatus("#paste-status", `${n}개 단어에 뜻과 예문을 넣었어요. 아래에서 확인하세요.`, "good"); }
    else setStatus("#paste-status", "고른 단어와 맞는 답이 없어요. 질문을 다시 복사해서 물어봐 주세요.", "err");
  });

  /* ---------- items editor ---------- */
  function renderItems() {
    const box = $("#items");
    const byWord = new Map(draft.items.map((i) => [i.word.toLowerCase(), i]));
    const pos = wordsInPassage();
    if (!draft.selected.length) { box.innerHTML = `<p class="notice">아직 고른 단어가 없어요. 2번에서 지문 속 단어를 눌러 주세요.</p>`; updatePlayState(); return; }
    box.innerHTML = draft.selected.map((w) => {
      const it = byWord.get(w);
      const tk = pos.get(w);
      const ctx = tk ? sentenceAt(draft.passage, tk.i) : "";
      const ctxHtml = esc(ctx).replace(new RegExp("(^|[^A-Za-z])(" + escRe(esc(tk?.t || w)) + ")(?![A-Za-z])", "i"), "$1<b>$2</b>");
      const k = esc(w);
      if (!it) return `<div class="item pending" data-w="${k}"><div class="item-head"><span class="w">${esc(tk?.t || w)}</span><button class="btn small" data-act="manual">직접 입력</button></div><p class="ctx">${ctxHtml}</p><p class="hint">3번에서 AI 답을 붙여 넣거나 '직접 입력'을 누르세요.</p></div>`;
      const probs = itemProblems(it);
      const opts = OBJ_KEYS.map((o) => `<option value="${o}"${o === it.object ? " selected" : ""}>${OBJECTS[o]}</option>`).join("");
      return `<div class="item${probs.length ? " bad" : ""}" data-w="${k}">
        <div class="item-head"><span class="w">${esc(it.word)}</span>
          <select data-f="object" aria-label="3D 물건" id="obj-${k}">${opts}</select>
          <button class="icon-btn" data-act="remove" title="빼기" aria-label="${esc(it.word)} 빼기">✕</button></div>
        <p class="ctx">${ctxHtml}</p>
        <div class="fields">
          <div class="field"><label for="pos-${k}">품사</label><input id="pos-${k}" data-f="pos" value="${esc(it.pos)}"></div>
          <div class="field"><label for="mean-${k}">문맥상 뜻</label><input id="mean-${k}" data-f="meaning" value="${esc(it.meaning)}"></div>
          <div class="field wide"><label for="sent-${k}">쉬운 예문</label><input class="en" id="sent-${k}" data-f="sentence" value="${esc(it.sentence)}"></div>
          <div class="field"><label for="ans-${k}">빈칸 정답</label><input class="en" id="ans-${k}" data-f="answer" value="${esc(it.answer)}"></div>
          <div class="field"><label for="ko-${k}">예문 해석</label><input id="ko-${k}" data-f="sentenceKo" value="${esc(it.sentenceKo)}"></div>
        </div>
        ${probs.length ? `<p class="warn">${probs.map(esc).join(" ")}</p>` : ""}
      </div>`;
    }).join("");
    updatePlayState();
  }
  function itemFor(node) { const w = node.closest(".item")?.dataset.w; return draft.items.find((i) => i.word.toLowerCase() === w); }
  $("#items").addEventListener("input", (e) => {
    const f = e.target.dataset.f; if (!f) return; const it = itemFor(e.target); if (!it) return;
    it[f] = e.target.value; saveDraft();
    const card = e.target.closest(".item"); const probs = itemProblems(it);
    card.classList.toggle("bad", !!probs.length);
    let w = card.querySelector(".warn");
    if (probs.length) { if (!w) { w = document.createElement("p"); w.className = "warn"; card.append(w); } w.textContent = probs.join(" "); }
    else w?.remove();
    updatePlayState();
  });
  $("#items").addEventListener("change", (e) => { if (e.target.dataset.f === "object") { const it = itemFor(e.target); if (it) { it.object = e.target.value; saveDraft(); } } });
  $("#items").addEventListener("click", (e) => {
    const act = e.target.closest("[data-act]")?.dataset.act; if (!act) return;
    const w = e.target.closest(".item").dataset.w;
    if (act === "remove") draft.selected = draft.selected.filter((x) => x !== w);
    if (act === "manual") {
      const tk = wordsInPassage().get(w);
      draft.items.push(fixItem({ word: tk?.t || w, sentence: tk ? sentenceAt(draft.passage, tk.i) : "", answer: tk?.t || w }, draft.items.length));
    }
    orderSelected(); saveDraft(); renderPicker(); renderItems();
  });
  function validSet(d) {
    if (!d.items?.length || pendingWordsOf(d).length || d.items.some((i) => itemProblems(i).length)) return null;
    return { title: d.title || "", passage: d.passage, items: d.items.map((i) => ({ word: i.word, pos: i.pos, meaning: i.meaning, sentence: i.sentence, answer: i.answer, sentenceKo: i.sentenceKo, object: i.object })) };
  }
  function pendingWordsOf(d) { const have = new Set(d.items.map((i) => i.word.toLowerCase())); return (d.selected || []).filter((w) => !have.has(w)); }
  function updatePlayState() {
    const ok = !!validSet(draft);
    $("#play").disabled = !ok;
    $("#save").disabled = !ok || !API.ready();
    $("#save-over").hidden = !draft.id;
    $("#save-over").disabled = !ok || !API.ready();
    if (!draft.selected.length) setStatus("#save-status", "");
    else if (!ok) setStatus("#save-status", pendingWords().length ? "뜻을 아직 넣지 않은 단어가 있어요." : "빨간 칸을 먼저 고쳐 주세요.");
    else if (!API.ready()) setStatus("#save-status", "구글 시트를 연결하면 저장할 수 있어요. 지금은 '미리 해 보기'만 돼요.");
    else setStatus("#save-status", `${draft.items.length}문제 준비 완료`, "good");
  }
  $("#play").addEventListener("click", () => { const s = validSet(draft); if (!s) return; startGame(s); showView("game"); });

  /* ---------- save to sheet ---------- */
  for (const id of ["#pw", "#pw2"]) { $(id).value = getPw(); $(id).addEventListener("input", (e) => { setPw(e.target.value); $("#pw").value = $("#pw2").value = e.target.value; }); }
  const studentLink = (id) => location.origin + location.pathname + "?set=" + encodeURIComponent(id);
  function drawQR(el, url, px) {
    el.innerHTML = "";
    if (!window.QRCode) { el.textContent = "QR을 불러오지 못했어요."; return; }
    try { new QRCode(el, { text: url, width: px, height: px, colorDark: "#000000", colorLight: "#FFFFFF", correctLevel: QRCode.CorrectLevel.M }); }
    catch { el.textContent = "QR을 만들지 못했어요."; }
  }
  function showQRBig(url, title) {
    let ov = $("#qr-big");
    if (!ov) {
      ov = document.createElement("div"); ov.id = "qr-big"; ov.className = "qr-big"; ov.hidden = true;
      ov.innerHTML = `<div class="qr-big-card"><h2 class="qr-big-title" id="qr-big-title"></h2><div class="qr-img" id="qr-big-img"></div><p class="hint">카메라로 찍고, 이름을 적고 시작하세요.</p><code class="qr-big-url" id="qr-big-url"></code><button class="btn big" id="qr-big-close">닫기</button></div>`;
      document.body.append(ov);
      $("#qr-big-close").onclick = () => { ov.hidden = true; };
      ov.addEventListener("click", (e) => { if (e.target === ov) ov.hidden = true; });
      document.addEventListener("keydown", (e) => { if (e.key === "Escape") ov.hidden = true; });
    }
    $("#qr-big-title").textContent = title || "낱말 조각 공방";
    $("#qr-big-url").textContent = url;
    drawQR($("#qr-big-img"), url, 900);
    ov.hidden = false;
  }
  function showLink(id) {
    const url = studentLink(id);
    const box = $("#linkbox"); box.hidden = false;
    box.innerHTML = `<div class="qr-img small" id="qr-small"></div>
      <div class="link-side"><span class="lbl2">학생용 링크</span><code id="link-text">${esc(url)}</code>
      <div class="row"><button class="btn small" id="copy-link">링크 복사</button><button class="btn small primary" id="qr-open">QR 크게 보기</button></div></div>`;
    drawQR($("#qr-small"), url, 360);
    $("#copy-link").onclick = async () => { const ok = await copyText(url); $("#copy-link").textContent = ok ? "복사했어요" : "길게 눌러 복사하세요"; };
    $("#qr-open").onclick = () => showQRBig(url, draft.title);
  }
  async function doSave(overwrite) {
    const set = validSet(draft); if (!set) return;
    const pw = $("#pw").value.trim(); if (!pw) { setStatus("#save-status", "교사 비밀번호를 적어 주세요.", "err"); $("#pw").focus(); return; }
    const btn = $(overwrite ? "#save-over" : "#save"); btn.disabled = true;
    setStatus("#save-status", `<span class="spin"></span> 저장하는 중…`);
    try {
      const j = await API.post({ action: "save", password: pw, id: overwrite ? (draft.id || "") : "", title: set.title || "(제목 없음)", data: JSON.stringify(set) });
      draft.id = j.id; saveDraft(); updatePlayState();
      setStatus("#save-status", overwrite ? "덮어썼어요. 링크는 그대로예요." : "새 문제로 저장했어요. 예전 문제와 링크도 그대로 남아 있어요.", "good");
      showLink(j.id);
    } catch (e) { setStatus("#save-status", esc(e.message || "저장하지 못했어요."), "err"); }
    btn.disabled = false;
  }


  $("#save").addEventListener("click", () => doSave(false));
  $("#save-over").addEventListener("click", () => doSave(true));

  /* ---------- saved sets & roster ---------- */
  let rosterId = null;
  async function loadSets() {
    const box = $("#sets");
    if (!API.ready()) { box.innerHTML = `<p class="notice">구글 시트가 연결되면 저장한 문제가 여기에 나와요.</p>`; return; }
    box.innerHTML = `<p class="hint"><span class="spin"></span> 불러오는 중…</p>`;
    try {
      const { sets } = await API.get({ action: "list" });
      if (!sets.length) { box.innerHTML = `<p class="notice">아직 저장한 문제가 없어요. '출제' 탭에서 만들어 저장하세요.</p>`; return; }
      box.innerHTML = sets.map((s) => `<div class="set-row" data-id="${esc(s.id)}">
        <div class="set-info"><b>${esc(s.title)}</b><span class="hint">${esc(fmtTime(s.updated))} · 단어 ${s.words}개 · 제출 ${s.done}명</span></div>
        <div class="set-acts">
          <button class="btn small" data-act="roster">명단 보기</button>
          <button class="btn small" data-act="qr">QR</button>
          <button class="btn small" data-act="link">링크 복사</button>
          <button class="btn small" data-act="edit">불러와 고치기</button>
          <button class="btn small danger" data-act="del">삭제</button>
        </div></div>`).join("");
      box._sets = sets;
    } catch (e) { box.innerHTML = `<p class="notice">${esc(e.message || "불러오지 못했어요.")}</p>`; }
  }
  $("#reload-sets").addEventListener("click", loadSets);
  $("#sets").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const row = b.closest(".set-row"); const id = row.dataset.id; const s = $("#sets")._sets.find((x) => x.id === id);
    if (b.dataset.act === "qr") showQRBig(studentLink(id), s.title);
    if (b.dataset.act === "link") { const ok = await copyText(studentLink(id)); b.textContent = ok ? "복사했어요" : studentLink(id); }
    if (b.dataset.act === "roster") { rosterId = id; $("#roster-title").textContent = `명단 · ${s.title}`; loadRoster(); }
    if (b.dataset.act === "edit") {
      try {
        const { set } = await API.get({ action: "set", id });
        const d = JSON.parse(set.data);
        draft = { id, title: d.title || "", passage: d.passage || "", items: d.items.map((it, i) => fixItem({ ...it }, i)), selected: d.items.map((it) => it.word.toLowerCase()) };
        orderSelected(); saveDraft(); fillSetupFields(); renderPicker(); renderItems(); showLink(id); showView("setup");
      } catch (err) { b.textContent = "불러오지 못했어요"; }
    }
    if (b.dataset.act === "del") {
      if (b.dataset.confirm !== "1") { b.dataset.confirm = "1"; b.textContent = "한 번 더 누르면 삭제"; setTimeout(() => { b.dataset.confirm = ""; b.textContent = "삭제"; }, 3000); return; }
      const pw = $("#pw2").value.trim(); if (!pw) { $("#roster-status").textContent = "삭제하려면 교사 비밀번호를 적어 주세요."; $("#pw2").focus(); return; }
      try { await API.post({ action: "delete", password: pw, id }); loadSets(); } catch (err) { b.textContent = err.message || "삭제 실패"; }
    }
  });
  function fmtTime(v) { const d = new Date(v); return isNaN(d) ? String(v || "") : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
  function fmtDur(sec) { sec = Number(sec) || 0; const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m}분 ${s}초` : `${s}초`; }
  async function loadRoster() {
    if (!rosterId) return;
    const pw = $("#pw2").value.trim(); if (!pw) { setStatus("#roster-status", "명단을 보려면 교사 비밀번호를 적어 주세요.", "err"); $("#pw2").focus(); return; }
    setStatus("#roster-status", `<span class="spin"></span> 불러오는 중…`); $("#reload-roster").hidden = false;
    try {
      const { results } = await API.post({ action: "results", password: pw, id: rosterId });
      const tb = $("#roster tbody");
      tb.innerHTML = results.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(fmtTime(r.time))}</td><td>${esc(fmtDur(r.seconds))}</td><td>${esc(r.miss)}</td><td class="stars-cell">${"★".repeat(Number(r.stars) || 0)}</td></tr>`).join("");
      $("#roster").hidden = !results.length; $("#roster-count").textContent = `${results.length}명`;
      setStatus("#roster-status", results.length ? "끝낸 순서대로 보여요. 같은 시트의 '결과' 탭에도 쌓여 있어요." : "아직 끝낸 학생이 없어요.", results.length ? "good" : "");
    } catch (e) { setStatus("#roster-status", esc(e.message || "불러오지 못했어요."), "err"); }
  }
  $("#reload-roster").addEventListener("click", loadRoster);
  $("#pw2").addEventListener("keydown", (e) => { if (e.key === "Enter") loadRoster(); });

  /* ======================================================
     GAME
     ====================================================== */
  let G = null;
  let fontsReady = null;
  function waitFonts() {
    if (!fontsReady) fontsReady = Promise.race([
      Promise.all([document.fonts.load('800 60px "Bricolage Grotesque"'), document.fonts.load('400 30px "Bagel Fat One"')]).catch(() => {}),
      sleep(2000),
    ]);
    return fontsReady;
  }

  async function startGame(set) {
    disposeThree();
    G = {
      set: clone(set),
      items: set.items.map((it, id) => ({ ...it, id })),
      matched: new Set(), placed: new Set(), filled: new Set(),
      miss: 0, stage: 1, t0: Date.now(), submitted: false, selEn: null, selKo: null, selChip: null, selSlot: null,
    };
    $("#g-title").textContent = set.title || "";
    $("#done").hidden = true; $("#done").innerHTML = "";
    $("#stage1").hidden = false; $("#stage2").hidden = true; $("#to-stage2").hidden = true;
    $("#sent-card").className = "sentence-card";
    $("#sent-card").innerHTML = `<span class="lbl">문장</span><p class="ko">짝을 맞히면 그 단어가 들어간 쉬운 문장이 여기 나와요.</p>`;
    updateStepper(); updateMiss();
    buildMatch();
    await waitFonts();
    buildPuzzle();
    layoutPuzzle();
  }
  $("#restart").addEventListener("click", () => { if (G) startGame(G.set); });
  function updateStepper() {
    $("#st1").className = G.stage === 1 ? "on" : "done";
    $("#st2").className = G.stage === 2 ? "on" : "";
  }
  function updateMiss() { $("#g-miss").textContent = `실수 ${G.miss}`; }

  /* ---------- stage 1: matching ---------- */
  function buildMatch() {
    const en = $("#col-en"), ko = $("#col-ko");
    $$(".card", en).forEach((n) => n.remove()); $$(".card", ko).forEach((n) => n.remove());
    for (const it of shuffle(G.items)) en.insertAdjacentHTML("beforeend", `<button class="card en" data-id="${it.id}">${esc(it.word)}</button>`);
    for (const it of shuffle(G.items)) ko.insertAdjacentHTML("beforeend", `<button class="card ko" data-id="${it.id}">${esc(it.meaning)}</button>`);
    updateMatchCount();
  }
  function updateMatchCount() { $("#match-count").textContent = `${G.matched.size} / ${G.items.length}`; }
  function onCard(e) {
    const b = e.target.closest(".card"); if (!b || !G || G.stage !== 1) return;
    const id = Number(b.dataset.id); const side = b.classList.contains("en") ? "selEn" : "selKo";
    if (G.matched.has(id) || G.lock) return;
    G[side] = G[side] === id ? null : id;
    renderSel();
    if (G.selEn != null && G.selKo != null) checkPair();
  }
  $("#col-en").addEventListener("click", onCard); $("#col-ko").addEventListener("click", onCard);
  function renderSel() {
    for (const c of $$("#col-en .card")) c.classList.toggle("sel", Number(c.dataset.id) === G.selEn);
    for (const c of $$("#col-ko .card")) c.classList.toggle("sel", Number(c.dataset.id) === G.selKo);
  }
  function checkPair() {
    const a = G.selEn, b = G.selKo;
    const en = $(`#col-en .card[data-id="${a}"]`), ko = $(`#col-ko .card[data-id="${b}"]`);
    const same = a === b || G.items[a].meaning.trim() === G.items[b].meaning.trim() && G.items[a].word.toLowerCase() === G.items[b].word.toLowerCase();
    if (same) {
      G.matched.add(a);
      en.classList.remove("sel"); ko.classList.remove("sel");
      en.classList.add("ok"); ko.classList.add("ok"); en.disabled = true; ko.disabled = true;
      if (a !== b) { ko.dataset.id = a; }
      G.selEn = G.selKo = null;
      showSentence(G.items[a]);
      unlockPiece(a);
      updateMatchCount(); checkStage1();
    } else {
      G.miss++; updateMiss(); G.lock = true;
      en.classList.add("no"); ko.classList.add("no");
      setTimeout(() => { en.classList.remove("no", "sel"); ko.classList.remove("no", "sel"); G.selEn = G.selKo = null; G.lock = false; }, 450);
    }
  }
  function highlight(sentence, answer) {
    const f = findAnswer(sentence, answer);
    if (!f) return esc(sentence);
    return esc(sentence.slice(0, f.index)) + "<mark>" + esc(f.text) + "</mark>" + esc(sentence.slice(f.index + f.text.length));
  }
  function showSentence(it) {
    const c = $("#sent-card");
    c.innerHTML = `<span class="lbl">${esc(it.word)} · ${esc(it.meaning)}${it.pos ? " · " + esc(it.pos) : ""}</span><p class="en">${highlight(it.sentence, it.answer)}</p>${it.sentenceKo ? `<p class="ko">${esc(it.sentenceKo)}</p>` : ""}`;
    c.classList.remove("fresh"); void c.offsetWidth; c.classList.add("fresh");
  }

  /* ---------- stage 1: jigsaw ---------- */
  const C = 240, TAB = Math.round(C * 0.32), RES = 1.5;
  const POSTER = ["#1F7A8C", "#F3B12B", "#E4572E", "#2448D8", "#3DAA6D", "#F28CA6", "#7A4FD1"];
  function gridFor(n) {
    let best = null;
    for (let rows = 1; rows <= 4; rows++) for (let cols = 1; cols <= 5; cols++) {
      const cells = cols * rows; if (cells < n) continue;
      const score = (cells - n) * 1.0 + Math.abs(cols / rows - 4 / 3) * 1.4;
      if (!best || score < best.score) best = { cols, rows, score };
    }
    return best;
  }
  function tabEdge(ctx, ax, ay, bx, by, s) {
    if (!s) { ctx.lineTo(bx, by); return; }
    const dx = bx - ax, dy = by - ay, nx = dy, ny = -dx;
    const P = (u, v) => [ax + dx * u + nx * v * s, ay + dy * u + ny * v * s];
    const L = (u, v) => ctx.lineTo(...P(u, v));
    const B = (a, b, c) => ctx.bezierCurveTo(...P(...a), ...P(...b), ...P(...c));
    L(0.37, 0);
    B([0.43, 0], [0.44, 0.06], [0.41, 0.10]);
    B([0.34, 0.18], [0.39, 0.30], [0.50, 0.30]);
    B([0.61, 0.30], [0.66, 0.18], [0.59, 0.10]);
    B([0.56, 0.06], [0.57, 0], [0.63, 0]);
    L(1, 0);
  }
  function piecePath(ctx, e) {
    ctx.beginPath(); ctx.moveTo(0, 0);
    tabEdge(ctx, 0, 0, C, 0, e.top); tabEdge(ctx, C, 0, C, C, e.right);
    tabEdge(ctx, C, C, 0, C, e.bottom); tabEdge(ctx, 0, C, 0, 0, e.left);
    ctx.closePath();
  }
  function starPath(ctx, cx, cy, r1, r2) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? r2 : r1; ctx[i ? "lineTo" : "moveTo"](cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    ctx.closePath();
  }
  function drawPoster(W, H, cells, cols) {
    const cv = document.createElement("canvas"); cv.width = W * RES; cv.height = H * RES;
    const ctx = cv.getContext("2d"); ctx.scale(RES, RES);
    const pal = shuffle(POSTER);
    ctx.fillStyle = pal[0]; ctx.fillRect(0, 0, W, H);
    // diagonal bands
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-0.42);
    const span = Math.hypot(W, H); const bw = 150;
    for (let x = -span, i = 0; x < span; x += bw, i++) { ctx.fillStyle = pal[i % pal.length]; ctx.fillRect(x, -span, bw + 1, span * 2); }
    ctx.restore();
    // big soft rings
    for (let i = 0; i < Math.max(4, cells.length); i++) {
      ctx.beginPath(); ctx.arc(Math.random() * W, Math.random() * H, 60 + Math.random() * 160, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,.14)"; ctx.fill();
      ctx.lineWidth = 10; ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.stroke();
    }
    // dots
    ctx.fillStyle = "rgba(20,25,40,.18)";
    for (let y = 18; y < H; y += 36) for (let x = 18 + (y / 36 % 2) * 18; x < W; x += 36) { ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2); ctx.fill(); }
    // words / bonus stars
    cells.forEach((word, idx) => {
      const r = Math.floor(idx / cols), c = idx % cols;
      const cx = c * C + C / 2, cy = r * C + C / 2;
      ctx.save(); ctx.translate(cx, cy); ctx.rotate((Math.random() - 0.5) * 0.22);
      if (word) {
        let size = 64; ctx.font = `800 ${size}px "Bricolage Grotesque", sans-serif`;
        const w = ctx.measureText(word).width; if (w > C * 0.74) size = Math.floor(size * C * 0.74 / w);
        ctx.font = `800 ${size}px "Bricolage Grotesque", sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.lineJoin = "round"; ctx.lineWidth = Math.max(6, size * 0.16); ctx.strokeStyle = "#14202A"; ctx.strokeText(word, 0, 0);
        ctx.fillStyle = "#FFFFFF"; ctx.fillText(word, 0, 0);
      } else {
        starPath(ctx, 0, 0, 70, 30); ctx.fillStyle = "#FFFFFF"; ctx.fill(); ctx.lineWidth = 6; ctx.lineJoin = "round"; ctx.strokeStyle = "#14202A"; ctx.stroke();
      }
      ctx.restore();
    });
    return cv;
  }
  function buildPuzzle() {
    const stage = $("#pstage");
    $$(".piece", stage).forEach((n) => n.remove());
    stage.classList.remove("complete");
    const n = G.items.length; const { cols, rows } = gridFor(n);
    const W = cols * C, H = rows * C;
    const order = shuffle([...Array(cols * rows).keys()]);
    const cellItem = Array(cols * rows).fill(null);
    G.items.forEach((it, i) => { cellItem[order[i]] = it.id; });
    const hE = [...Array(rows)].map(() => [...Array(cols)].map(() => (Math.random() < 0.5 ? 1 : -1)));
    const vE = [...Array(rows)].map(() => [...Array(cols)].map(() => (Math.random() < 0.5 ? 1 : -1)));
    const poster = drawPoster(W, H, cellItem.map((id) => (id == null ? null : G.items[id].word)), cols);
    const pieces = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = r * cols + c; const itemId = cellItem[cell];
      const e = { top: r ? -vE[r - 1][c] : 0, right: c < cols - 1 ? hE[r][c] : 0, bottom: r < rows - 1 ? vE[r][c] : 0, left: c ? -hE[r][c - 1] : 0 };
      const S = C + 2 * TAB;
      const cv = document.createElement("canvas"); cv.width = S * RES; cv.height = S * RES; cv.className = "piece";
      const ctx = cv.getContext("2d", { willReadFrequently: true });
      ctx.scale(RES, RES); ctx.translate(TAB, TAB); piecePath(ctx, e);
      ctx.save(); ctx.clip(); ctx.drawImage(poster, -c * C, -r * C, W, H); ctx.restore();
      ctx.lineJoin = "round"; ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,.6)"; ctx.stroke();
      ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(10,15,25,.45)"; ctx.stroke();
      const p = { r, c, e, itemId, el: cv, ctx, x: 0, y: 0, k: 1, state: itemId == null ? "placed" : "hidden", slot: -1 };
      cv.hidden = p.state === "hidden";
      if (p.state === "placed") cv.classList.add("placed");
      cv._p = p; stage.append(cv); pieces.push(p);
    }
    G.pz = { cols, rows, W, H, poster, pieces, trayOrder: [], s: 1, z: 10 };
    updatePuzzleCount();
  }
  function updatePuzzleCount() { $("#puzzle-count").textContent = `조각 ${G.placed.size} / ${G.items.length}`; }
  function layoutPuzzle() {
    if (!G?.pz || G.stage !== 1 || $("#view-game").hidden) return;
    const pz = G.pz, host = $("#puzzle-host"), stage = $("#pstage");
    const availW = host.clientWidth; if (!availW) return;
    const maxH = Math.max(220, window.innerHeight * 0.4);
    const boardW = Math.min(availW, maxH * pz.W / pz.H), s = boardW / pz.W, boardH = pz.H * s;
    const cellCss = C * s, n = G.items.length;
    let k = 0.62, perRow, trayRows, slotH;
    for (;;) { const slot = cellCss * k * 1.5; perRow = Math.max(1, Math.floor(boardW / slot)); trayRows = Math.ceil(n / perRow); slotH = slot; if (trayRows <= 2 || k <= 0.34) break; k -= 0.04; }
    const slotW = boardW / perRow, gap = 12, trayTop = boardH + gap, trayH = trayRows * slotH + 22;
    Object.assign(pz, { s, boardW, boardH, k, perRow, slotW, slotH, trayTop });
    stage.style.width = boardW + "px"; stage.style.height = trayTop + trayH + "px";
    const tb = $("#tray-bg"); tb.style.top = trayTop + "px"; tb.style.height = trayH + "px";
    drawBoard();
    const pw = (C + 2 * TAB) * s;
    for (const p of pz.pieces) {
      p.el.style.width = pw + "px"; p.el.style.height = pw + "px";
      if (p.state === "placed") { p.x = (p.c * C + C / 2) * s; p.y = (p.r * C + C / 2) * s; p.k = 1; }
      else if (p.state === "tray" || p.state === "drag") { setTrayPos(p); if (p.state === "drag") p.state = "tray"; }
      applyPiece(p);
    }
  }
  function setTrayPos(p) {
    const pz = G.pz; const j = p.slot; const col = j % pz.perRow, row = Math.floor(j / pz.perRow);
    p.x = pz.slotW * (col + 0.5); p.y = pz.trayTop + 18 + pz.slotH * (row + 0.5); p.k = pz.k;
  }
  function applyPiece(p) {
    const pw = (C + 2 * TAB) * G.pz.s;
    p.el.style.left = p.x - pw / 2 + "px"; p.el.style.top = p.y - pw / 2 + "px"; p.el.style.scale = p.k;
  }
  function drawBoard() {
    const pz = G.pz, cv = $("#board"), dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(pz.boardW * dpr); cv.height = Math.round(pz.boardH * dpr);
    cv.style.width = pz.boardW + "px"; cv.style.height = pz.boardH + "px";
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr * pz.s, 0, 0, dpr * pz.s, 0, 0);
    ctx.fillStyle = cssVar("--surface-2") || "#eee"; ctx.fillRect(0, 0, pz.W, pz.H);
    ctx.globalAlpha = 0.16; ctx.drawImage(pz.poster, 0, 0, pz.W, pz.H); ctx.globalAlpha = 1;
    ctx.strokeStyle = cssVar("--muted") || "#888"; ctx.globalAlpha = 0.45; ctx.lineWidth = 2 / pz.s; ctx.setLineDash([8, 7]);
    for (const p of pz.pieces) { ctx.save(); ctx.translate(p.c * C, p.r * C); piecePath(ctx, p.e); ctx.stroke(); ctx.restore(); }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
  }
  function unlockPiece(itemId) {
    const p = G.pz?.pieces.find((q) => q.itemId === itemId); if (!p || p.state !== "hidden") return;
    p.slot = G.pz.trayOrder.length; G.pz.trayOrder.push(p);
    p.state = "tray"; p.el.hidden = false; setTrayPos(p); applyPiece(p);
    p.el.style.zIndex = ++G.pz.z;
    p.el.classList.remove("born"); void p.el.offsetWidth; p.el.classList.add("born");
  }

  let drag = null;
  function pickPiece(cx, cy) {
    for (const node of document.elementsFromPoint(cx, cy)) {
      const p = node._p; if (!p || p.state !== "tray") continue;
      const r = node.getBoundingClientRect();
      const lx = Math.floor((cx - r.left) / r.width * node.width), ly = Math.floor((cy - r.top) / r.height * node.height);
      try { if (p.ctx.getImageData(lx, ly, 1, 1).data[3] > 20) return p; } catch { return p; }
    }
    return null;
  }
  const pstage = $("#pstage");
  pstage.addEventListener("pointerdown", (e) => {
    if (!G?.pz || drag) return;
    const p = pickPiece(e.clientX, e.clientY); if (!p) return;
    e.preventDefault();
    const rect = pstage.getBoundingClientRect(); const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const L = (px - p.x) / p.k, M = (py - p.y) / p.k;
    drag = { p, id: e.pointerId, ox: -L, oy: -M };
    p.state = "drag"; p.k = 1; p.x = px - L; p.y = py - M;
    p.el.classList.remove("anim", "born", "snap"); p.el.classList.add("dragging"); p.el.style.zIndex = ++G.pz.z;
    try { pstage.setPointerCapture(e.pointerId); } catch {}
    applyPiece(p);
  });
  pstage.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const rect = pstage.getBoundingClientRect(); const p = drag.p;
    p.x = Math.min(rect.width, Math.max(0, e.clientX - rect.left + drag.ox));
    p.y = Math.min(rect.height, Math.max(0, e.clientY - rect.top + drag.oy));
    applyPiece(p);
  });
  function endDrag(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const p = drag.p; drag = null;
    const s = G.pz.s, tx = (p.c * C + C / 2) * s, ty = (p.r * C + C / 2) * s;
    p.el.classList.remove("dragging"); p.el.classList.add("anim");
    if (Math.hypot(p.x - tx, p.y - ty) < C * s * 0.36) {
      p.state = "placed"; p.x = tx; p.y = ty; p.k = 1; p.el.classList.add("placed", "snap"); p.el.style.zIndex = 2;
      G.placed.add(p.itemId); updatePuzzleCount(); checkStage1();
    } else { p.state = "tray"; setTrayPos(p); }
    applyPiece(p);
  }
  pstage.addEventListener("pointerup", endDrag);
  pstage.addEventListener("pointercancel", endDrag);
  new ResizeObserver(() => { if (!drag) layoutPuzzle(); }).observe($("#puzzle-host"));

  function checkStage1() {
    if (G.matched.size === G.items.length && G.placed.size === G.items.length) {
      $("#pstage").classList.add("complete");
      $("#to-stage2").hidden = false;
      $("#to-stage2").scrollIntoView({ behavior: reduced() ? "auto" : "smooth", block: "nearest" });
    }
  }
  $("#to-stage2").addEventListener("click", startStage2);

  /* ---------- stage 2: blanks + 3D ---------- */
  function startStage2() {
    G.stage = 2; updateStepper();
    $("#stage1").hidden = true; $("#stage2").hidden = false;
    $("#bank").innerHTML = shuffle(G.items).map((it) => `<button class="chip" data-id="${it.id}">${esc(it.answer)}</button>`).join("");
    $("#blanks").innerHTML = G.items.map((it) => {
      const f = findAnswer(it.sentence, it.answer);
      const before = f ? it.sentence.slice(0, f.index) : it.sentence + " ";
      const after = f ? it.sentence.slice(f.index + f.text.length) : "";
      return `<li data-id="${it.id}"><p class="en">${esc(before)}<button class="slot" data-id="${it.id}" aria-label="${it.id + 1}번 빈칸">?</button>${esc(after)}</p>${it.sentenceKo ? `<p class="ko">${esc(it.sentenceKo)}</p>` : ""}</li>`;
    }).join("");
    $("#collected").innerHTML = "";
    $("#three-empty").hidden = false; $("#three-msg").innerHTML = "";
    updateBlankCount();
    initThree();
    window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  }
  function updateBlankCount() { $("#blank-count").textContent = `${G.filled.size} / ${G.items.length}`; }
  function renderS2Sel() {
    for (const c of $$("#bank .chip")) c.classList.toggle("sel", Number(c.dataset.id) === G.selChip);
    for (const s of $$("#blanks .slot")) s.classList.toggle("target", Number(s.dataset.id) === G.selSlot);
  }
  $("#bank").addEventListener("click", (e) => {
    const b = e.target.closest(".chip"); if (!b || G.lock) return;
    const id = Number(b.dataset.id); G.selChip = G.selChip === id ? null : id; renderS2Sel();
    if (G.selChip != null && G.selSlot != null) checkBlank();
  });
  $("#blanks").addEventListener("click", (e) => {
    const s = e.target.closest(".slot"); if (!s || G.lock) return;
    const id = Number(s.dataset.id); if (G.filled.has(id)) return;
    G.selSlot = G.selSlot === id ? null : id; renderS2Sel();
    if (G.selChip != null && G.selSlot != null) checkBlank();
  });
  function checkBlank() {
    const chipId = G.selChip, slotId = G.selSlot;
    const chip = $(`#bank .chip[data-id="${chipId}"]`), slot = $(`#blanks .slot[data-id="${slotId}"]`);
    const ok = chipId === slotId || G.items[chipId].answer.toLowerCase() === G.items[slotId].answer.toLowerCase();
    if (ok) {
      G.filled.add(slotId); G.selChip = G.selSlot = null;
      chip.remove(); slot.textContent = G.items[slotId].answer; slot.classList.remove("target"); slot.classList.add("ok"); slot.disabled = true;
      slot.closest("li").classList.add("ok");
      reveal(G.items[slotId], slot); updateBlankCount();
      if (G.filled.size === G.items.length) setTimeout(finish, reduced() ? 1100 : 2000);
    } else {
      G.miss++; updateMiss(); G.lock = true;
      chip.classList.add("no"); slot.classList.add("no");
      setTimeout(() => { chip.classList.remove("no", "sel"); slot.classList.remove("no", "target"); G.selChip = G.selSlot = null; G.lock = false; }, 450);
    }
  }
  function reveal(it, slotEl) {
    const m = $("#three-msg");
    m.innerHTML = `<span class="big">${esc(it.answer)}</span>${esc(it.meaning)} → ${esc(OBJECTS[it.object] || "")}`;
    $("#collected").insertAdjacentHTML("beforeend", `<li><b>${esc(it.word)}</b> · ${esc(it.meaning)} · ${esc(OBJECTS[it.object] || "")}</li>`);
    const g = G;
    popObject(it, slotEl, () => {
      if (G !== g) return;
      $("#three-empty").hidden = true;
      m.classList.remove("pop"); void m.offsetWidth; m.classList.add("pop");
      addObject(it);
    });
  }

  /* ---------- pop-up: bursts at the answered blank, then shrinks into the shelf ---------- */
  let POP = null;
  function popObject(it, fromEl, done) {
    let box = $("#pop3d");
    if (!box) {
      box = document.createElement("div"); box.id = "pop3d"; box.className = "pop3d"; box.hidden = true; box.setAttribute("aria-live", "polite");
      box.innerHTML = `<div class="pop-burst" aria-hidden="true"></div><canvas id="pop-canvas" width="280" height="280"></canvas><div class="pop-label" id="pop-label"></div>`;
      document.body.append(box);
    }
    $("#pop-label").innerHTML = `<b>${esc(it.answer)}</b><span>${esc(OBJECTS[it.object] || "")} 획득!</span>`;
    if (window.THREE && POP === null) {
      try {
        const renderer = new THREE.WebGLRenderer({ canvas: $("#pop-canvas"), antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(280, 280, false);
        renderer.outputEncoding = THREE.sRGBEncoding;
        const scene = new THREE.Scene();
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8796a8, 1.0));
        const sun = new THREE.DirectionalLight(0xffffff, 0.9); sun.position.set(2, 4, 5); scene.add(sun);
        const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50); camera.position.set(0, 0.9, 3.4); camera.lookAt(0, 0.5, 0);
        POP = { renderer, scene, camera, obj: null, raf: 0, t0: 0 };
      } catch { POP = false; }
    }
    if (POP) {
      if (POP.obj) { POP.scene.remove(POP.obj); POP.obj.traverse((o) => { o.geometry?.dispose?.(); if (o.material) [].concat(o.material).forEach((m) => m.dispose()); }); }
      POP.obj = normalize(buildObject(it.object)); POP.scene.add(POP.obj);
      POP.t0 = performance.now(); cancelAnimationFrame(POP.raf);
      const loop = (now) => {
        const age = (now - POP.t0) / 1000;
        POP.obj.scale.setScalar(reduced() ? 1 : Math.max(0.001, easeOutBack(Math.min(1, age / 0.4))));
        POP.obj.rotation.y = age * 3.5;
        POP.renderer.render(POP.scene, POP.camera);
        if (age < 2) POP.raf = requestAnimationFrame(loop);
      };
      POP.raf = requestAnimationFrame(loop);
    }
    box.classList.toggle("no3d", !POP);
    // start at the answered blank, end at the shelf
    const vw = window.innerWidth, vh = window.innerHeight, size = Math.min(240, vw * 0.6);
    const fr = (fromEl || $("#blanks")).getBoundingClientRect();
    const sx = Math.min(vw - size / 2 - 8, Math.max(size / 2 + 8, fr.left + fr.width / 2));
    const sy = Math.min(vh - size / 2 - 8, Math.max(size / 2 + 8, fr.top + fr.height / 2));
    const tr = $("#three-host").getBoundingClientRect();
    const tx = Math.min(vw, Math.max(0, tr.left + tr.width / 2)), ty = Math.min(vh + 40, Math.max(-40, tr.top + tr.height / 2));
    box.style.width = box.style.height = size + "px";
    box.style.left = sx + "px"; box.style.top = sy + "px";
    box.hidden = false;
    box._anim?.cancel(); clearTimeout(box._t);
    const dx = tx - sx, dy = ty - sy;
    const finishPop = () => { box.hidden = true; done && done(); };
    if (reduced() || !box.animate) { box._t = setTimeout(finishPop, 900); return; }
    const T = (x, y, s) => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${s})`;
    box._anim = box.animate([
      { transform: T(0, 0, 0.3), opacity: 0, offset: 0 },
      { transform: T(0, 0, 1.12), opacity: 1, offset: 0.14 },
      { transform: T(0, 0, 1), opacity: 1, offset: 0.24 },
      { transform: T(0, 0, 1), opacity: 1, offset: 0.62 },
      { transform: T(dx, dy, 0.18), opacity: 0.85, offset: 1 },
    ], { duration: 1700, easing: "ease-in-out" });
    box._anim.onfinish = finishPop;
    const burst = box.querySelector(".pop-burst");
    burst.animate([{ transform: "scale(.3)", opacity: 0 }, { transform: "scale(1.25)", opacity: 1, offset: 0.16 }, { transform: "scale(1.5)", opacity: 0, offset: 0.55 }, { opacity: 0 }], { duration: 1700 });
  }
  function finish() {
    const n = G.items.length, miss = G.miss;
    const stars = miss === 0 ? 3 : miss <= Math.ceil(n / 3) ? 2 : 1;
    const seconds = Math.round((Date.now() - G.t0) / 1000);
    const d = $("#done");
    d.innerHTML = `<span class="stars" aria-label="별 ${stars}개">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span><div><h2>모두 모았어요!</h2><p>${n}개 단어 · 실수 ${miss}번 · ${fmtDur(seconds)}</p><p id="submit-status"></p></div><button class="btn big" id="again">다시 하기</button>`;
    d.hidden = false;
    $("#again").addEventListener("click", () => startGame(G.set));
    $("#st2").className = "done";
    if (STUDENT && studentName && !G.submitted) submitResult({ stars, seconds, miss, n });
  }
  async function submitResult(r) {
    G.submitted = true;
    const s = $("#submit-status");
    if (SET_ID === "sample" || !API.ready()) { s.textContent = "연습용 문제라 제출하지 않았어요."; return; }
    s.textContent = "선생님께 제출하는 중…";
    try {
      await API.post({ action: "result", id: SET_ID, name: studentName, miss: r.miss, stars: r.stars, seconds: r.seconds, words: r.n });
      s.textContent = `${studentName} 이름으로 선생님께 제출했어요.`;
    } catch (e) {
      G.submitted = false;
      s.innerHTML = `제출하지 못했어요. <button class="btn small" id="resubmit">다시 제출</button>`;
      $("#resubmit").onclick = () => submitResult(r);
    }
  }

  /* ---------- Three.js shelf ---------- */
  let T3 = null;
  function initThree() {
    disposeThree();
    const host = $("#three-host");
    if (!window.THREE) { $("#three-empty").textContent = "이 기기에서는 3D를 불러오지 못했어요. 모은 물건은 아래 목록에 나와요."; return; }
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: $("#three"), antialias: true, alpha: true }); }
    catch { $("#three-empty").textContent = "이 기기에서는 3D를 표시할 수 없어요. 모은 물건은 아래 목록에 나와요."; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8796a8, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(3, 6, 5); scene.add(sun);
    const n = G.items.length;
    const radius = n <= 1 ? 0 : Math.max(1.5, n * 0.36);
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(radius + 0.9, radius + 1.05, 0.2, 64), new THREE.MeshStandardMaterial({ color: groundColor(), roughness: 0.9 }));
    ground.position.y = -0.1; scene.add(ground);
    const dist = radius * 2.1 + 3.6;
    camera.position.set(0, 1.4 + radius * 0.75, dist); camera.lookAt(0, 0.45, 0);
    T3 = { renderer, scene, camera, ground, radius, objs: [], rot: 0, dragging: null, raf: 0, last: performance.now(), host };
    const resize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    T3.ro = new ResizeObserver(resize); T3.ro.observe(host); resize();
    host.onpointerdown = (e) => { T3.dragging = { x: e.clientX, rot: T3.rot, id: e.pointerId }; try { host.setPointerCapture(e.pointerId); } catch {} };
    host.onpointermove = (e) => { if (T3?.dragging && e.pointerId === T3.dragging.id) T3.rot = T3.dragging.rot + (e.clientX - T3.dragging.x) * 0.01; };
    host.onpointerup = host.onpointercancel = () => { if (T3) T3.dragging = null; };
    T3.mql = window.matchMedia("(prefers-color-scheme: dark)");
    T3.onTheme = () => { if (T3) T3.ground.material.color.set(groundColor()); };
    T3.mql.addEventListener?.("change", T3.onTheme);
    const loop = (now) => {
      if (!T3) return;
      T3.raf = requestAnimationFrame(loop);
      if ($("#stage2").hidden || $("#view-game").hidden) return;
      const dt = Math.min(0.05, (now - T3.last) / 1000); T3.last = now;
      if (!T3.dragging && !reduced()) T3.rot += dt * 0.18;
      const t = now / 1000;
      for (const o of T3.objs) animObj(o, t);
      renderer.render(scene, camera);
    };
    T3.raf = requestAnimationFrame(loop);
  }
  function groundColor() { return new THREE.Color(cssVar("--line") || "#cfdad6"); }
  function disposeThree() {
    if (!T3) return;
    cancelAnimationFrame(T3.raf); T3.ro?.disconnect(); T3.mql?.removeEventListener?.("change", T3.onTheme);
    T3.scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
    T3.renderer.dispose();
    const h = T3.host; h.onpointerdown = h.onpointermove = h.onpointerup = h.onpointercancel = null;
    T3 = null;
  }
  const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const easeInOut = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  function slotWorld(o) {
    const a = o.angle + T3.rot;
    return new THREE.Vector3(Math.sin(a) * T3.radius, 0, Math.cos(a) * T3.radius);
  }
  function animObj(o, t) {
    const age = t - o.t0; const slot = slotWorld(o);
    o.holder.rotation.y = o.phase + t * 0.7;
    o.holder.position.copy(slot);
    if (reduced() || age > 0.6) { o.holder.scale.setScalar(1); return; }
    o.holder.scale.setScalar(Math.max(0.001, easeOutBack(age / 0.6)));
    o.holder.position.y += Math.sin((age / 0.6) * Math.PI) * 0.3;
  }
  function addObject(it) {
    if (!T3) return;
    const holder = new THREE.Group();
    holder.add(normalize(buildObject(it.object)));
    const idx = G.items.findIndex((x) => x.id === it.id);
    const angle = G.items.length <= 1 ? 0 : (idx / G.items.length) * Math.PI * 2;
    const o = { holder, angle, phase: Math.random() * 6, t0: performance.now() / 1000 };
    T3.scene.add(holder); T3.objs.push(o); animObj(o, o.t0);
  }
  function normalize(g) {
    const box = new THREE.Box3().setFromObject(g); const size = new THREE.Vector3(); box.getSize(size);
    const s = 1.05 / Math.max(size.x, size.y, size.z, 0.01); g.scale.setScalar(s);
    const b2 = new THREE.Box3().setFromObject(g); const c = new THREE.Vector3(); b2.getCenter(c);
    g.position.set(-c.x, -b2.min.y, -c.z);
    const w = new THREE.Group(); w.add(g); return w;
  }

  /* object models: low-poly toys built from primitives */
  function buildObject(key) {
    const M = (color, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.5, metalness: 0.05, flatShading: true }, o));
    const mesh = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); return m; };
    const group = (...ms) => { const g = new THREE.Group(); ms.forEach((m) => g.add(m)); return g; };
    const ext = (shape, depth, mat) => { const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.05, bevelSegments: 2 }); g.center(); return new THREE.Mesh(g, mat); };
    const gold = M(0xF2B62E, { metalness: 0.45, roughness: 0.3 });
    const B = {
      star() { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.23 : 0.56; s[i ? "lineTo" : "moveTo"](Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); return group(ext(s, 0.2, gold)); },
      heart() { const s = new THREE.Shape(); s.moveTo(0, -0.5); s.bezierCurveTo(-0.15, -0.3, -0.62, -0.08, -0.62, 0.2); s.bezierCurveTo(-0.62, 0.5, -0.28, 0.62, 0, 0.36); s.bezierCurveTo(0.28, 0.62, 0.62, 0.5, 0.62, 0.2); s.bezierCurveTo(0.62, -0.08, 0.15, -0.3, 0, -0.5); return group(ext(s, 0.24, M(0xE5484D, { flatShading: false, roughness: 0.35 }))); },
      rocket() {
        const white = M(0xF1F3F6), red = M(0xE5484D);
        const g = group(mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.8, 12), white, 0, 0.55), mesh(new THREE.ConeGeometry(0.22, 0.38, 12), red, 0, 1.14));
        const win = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), M(0x4AA3FF, { metalness: 0.3 }), 0, 0.68, 0.23); win.rotation.x = Math.PI / 2; g.add(win);
        for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; const f = mesh(new THREE.BoxGeometry(0.05, 0.3, 0.24), red, Math.sin(a) * 0.3, 0.27, Math.cos(a) * 0.3); f.rotation.y = a; g.add(f); }
        g.add(mesh(new THREE.ConeGeometry(0.15, 0.25, 10), M(0xF5A524, { emissive: 0xF57C00, emissiveIntensity: 0.5 }), 0, 0.03).rotateX(Math.PI));
        return g;
      },
      book() {
        const a = group(mesh(new THREE.BoxGeometry(0.9, 0.16, 1.1), M(0x2F55D4)), mesh(new THREE.BoxGeometry(0.84, 0.12, 1.04), M(0xF6EEDC), 0.04, 0));
        const b = group(mesh(new THREE.BoxGeometry(0.8, 0.14, 1.0), M(0x2FA36B)), mesh(new THREE.BoxGeometry(0.74, 0.1, 0.94), M(0xF6EEDC), 0.04, 0));
        a.position.y = 0.08; b.position.y = 0.24; b.rotation.y = 0.35; return group(a, b);
      },
      magnifier() {
        const ring = mesh(new THREE.TorusGeometry(0.32, 0.065, 10, 32), M(0x2E3A46, { metalness: 0.4 }), 0, 0.8);
        const glass = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.03, 32), M(0xBFE6FF, { transparent: true, opacity: 0.55, metalness: 0.2, roughness: 0.05 }), 0, 0.8); glass.rotation.x = Math.PI / 2;
        const handle = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.55, 10), M(0x8A5A3B), 0.33, 0.28); handle.rotation.z = 0.62;
        return group(ring, glass, handle);
      },
      bulb() {
        return group(
          mesh(new THREE.SphereGeometry(0.4, 18, 14), M(0xFFE27A, { emissive: 0xFFC83D, emissiveIntensity: 0.55, flatShading: false, roughness: 0.2 }), 0, 0.8),
          mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.2, 14), M(0xFFE27A, { emissive: 0xFFC83D, emissiveIntensity: 0.3 }), 0, 0.42),
          mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.12, 14), M(0x9AA4AE, { metalness: 0.6, roughness: 0.3 }), 0, 0.27),
          mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.12, 14), M(0x7E8893, { metalness: 0.6, roughness: 0.3 }), 0, 0.15),
          mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.08, 10), M(0x2E3A46), 0, 0.05));
      },
      pencil() {
        const g = group(
          mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.0, 6), M(0xF6C443)),
          mesh(new THREE.ConeGeometry(0.12, 0.26, 6), M(0xE7C08E), 0, 0.63),
          mesh(new THREE.ConeGeometry(0.045, 0.09, 6), M(0x2E3A46), 0, 0.72),
          mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.07, 6), M(0xA9B2BB, { metalness: 0.5 }), 0, -0.53),
          mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.14, 6), M(0xF28CA6), 0, -0.63));
        g.rotation.z = 0.7; return g;
      },
      clock() {
        const face = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.14, 32), M(0xFFFFFF, { flatShading: false }), 0, 0.62); face.rotation.x = Math.PI / 2;
        const rim = mesh(new THREE.TorusGeometry(0.5, 0.06, 8, 32), M(0xE5484D), 0, 0.62);
        const dark = M(0x1E2A33);
        const h1 = mesh(new THREE.BoxGeometry(0.05, 0.26, 0.03), dark, 0, 0.73, 0.09);
        const h2 = mesh(new THREE.BoxGeometry(0.04, 0.36, 0.03), dark, 0.12, 0.55, 0.1); h2.rotation.z = 2.2;
        const g = group(face, rim, h1, h2, mesh(new THREE.SphereGeometry(0.05, 10, 8), dark, 0, 0.62, 0.1),
          mesh(new THREE.SphereGeometry(0.13, 12, 8), M(0xE5484D), -0.34, 1.14), mesh(new THREE.SphereGeometry(0.13, 12, 8), M(0xE5484D), 0.34, 1.14));
        const legA = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), dark, -0.25, 0.09); legA.rotation.z = -0.4;
        const legB = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 6), dark, 0.25, 0.09); legB.rotation.z = 0.4;
        g.add(legA, legB); return g;
      },
      key() {
        const g = group(mesh(new THREE.TorusGeometry(0.22, 0.08, 10, 22), gold, -0.42, 0),
          mesh(new THREE.BoxGeometry(0.75, 0.1, 0.1), gold, 0.12, 0),
          mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), gold, 0.42, -0.14),
          mesh(new THREE.BoxGeometry(0.08, 0.14, 0.1), gold, 0.26, -0.11));
        g.rotation.z = 0.35; return g;
      },
      trophy() {
        const pts = [[0, 0], [0.16, 0], [0.22, 0.05], [0.38, 0.32], [0.42, 0.55], [0.4, 0.58], [0.34, 0.33], [0, 0.22]].map(([x, y]) => new THREE.Vector2(x, y));
        const cup = mesh(new THREE.LatheGeometry(pts, 20), gold, 0, 0.62);
        const hl = mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 16, Math.PI), gold, -0.4, 0.95); hl.rotation.z = Math.PI / 2;
        const hr = mesh(new THREE.TorusGeometry(0.13, 0.035, 8, 16, Math.PI), gold, 0.4, 0.95); hr.rotation.z = -Math.PI / 2;
        return group(cup, hl, hr, mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.36, 10), gold, 0, 0.44),
          mesh(new THREE.BoxGeometry(0.42, 0.12, 0.42), gold, 0, 0.22), mesh(new THREE.BoxGeometry(0.62, 0.16, 0.62), M(0x5A3A26), 0, 0.08));
      },
      tree() {
        return group(mesh(new THREE.CylinderGeometry(0.1, 0.14, 0.38, 8), M(0x8A5A3B), 0, 0.19),
          mesh(new THREE.ConeGeometry(0.52, 0.58, 8), M(0x2F9E5B), 0, 0.62),
          mesh(new THREE.ConeGeometry(0.42, 0.48, 8), M(0x37B068), 0, 0.92),
          mesh(new THREE.ConeGeometry(0.3, 0.38, 8), M(0x45C077), 0, 1.18));
      },
      house() {
        const roof = mesh(new THREE.ConeGeometry(0.7, 0.48, 4), M(0xD9534F), 0, 0.84); roof.rotation.y = Math.PI / 4;
        return group(mesh(new THREE.BoxGeometry(0.82, 0.6, 0.72), M(0xF3E3C3), 0, 0.3), roof,
          mesh(new THREE.BoxGeometry(0.2, 0.32, 0.03), M(0x7A4B2E), -0.12, 0.16, 0.37),
          mesh(new THREE.BoxGeometry(0.18, 0.18, 0.03), M(0x6EC1FF, { metalness: 0.3 }), 0.22, 0.38, 0.37),
          mesh(new THREE.BoxGeometry(0.12, 0.26, 0.12), M(0x9AA4AE), 0.24, 0.98, -0.1));
      },
      gem() {
        const m = M(0x38C6D9, { metalness: 0.25, roughness: 0.12 });
        const p = mesh(new THREE.ConeGeometry(0.56, 0.6, 8), m, 0, 0.3); p.rotation.x = Math.PI;
        return group(p, mesh(new THREE.CylinderGeometry(0.34, 0.56, 0.24, 8), m, 0, 0.72));
      },
      globe() {
        const g = group(mesh(new THREE.SphereGeometry(0.42, 22, 16), M(0x3A86E8, { flatShading: false, roughness: 0.4 }), 0, 0.82));
        const land = M(0x45B36B);
        [[0.3, 0.2, 0.2], [-0.2, 0.3, 0.25], [0.05, -0.2, 0.38], [-0.33, -0.05, -0.2], [0.15, 0.1, -0.38]].forEach(([x, y, z]) => {
          const b = mesh(new THREE.SphereGeometry(0.15, 10, 8), land, x, 0.82 + y, z);
          const v = new THREE.Vector3(x, y, z).normalize().multiplyScalar(0.36); b.position.set(v.x, 0.82 + v.y, v.z); b.scale.set(1, 0.7, 1); g.add(b);
        });
        const arc = mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 28, Math.PI), M(0xA9B2BB, { metalness: 0.6 }), 0, 0.82); arc.rotation.z = Math.PI / 2 + 0.3;
        g.add(arc, mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), M(0xA9B2BB, { metalness: 0.6 }), 0, 0.2), mesh(new THREE.CylinderGeometry(0.24, 0.3, 0.08, 20), M(0x2E3A46), 0, 0.04));
        return g;
      },
      moon() {
        const g = group(mesh(new THREE.SphereGeometry(0.5, 18, 14), M(0xDCD8CC), 0, 0.5));
        const dark = M(0xB5AF9F);
        [[0.2, 0.25, 0.4, 0.12], [-0.25, 0.05, 0.4, 0.1], [0.05, -0.25, 0.42, 0.14], [0.35, -0.1, 0.25, 0.08], [-0.1, 0.38, 0.28, 0.07]].forEach(([x, y, z, r]) => {
          const v = new THREE.Vector3(x, y, z).normalize().multiplyScalar(0.47); g.add(mesh(new THREE.SphereGeometry(r, 10, 8), dark, v.x, 0.5 + v.y, v.z));
        });
        return g;
      },
      flower() {
        const green = M(0x37A85F);
        const leaf = mesh(new THREE.SphereGeometry(0.14, 10, 8), green, 0.13, 0.32); leaf.scale.set(1.4, 0.35, 0.6); leaf.rotation.z = 0.5;
        const g = group(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.8, 6), green, 0, 0.4), leaf,
          mesh(new THREE.SphereGeometry(0.13, 12, 10), M(0xF6C443), 0, 0.88, 0.04),
          mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 10), M(0xC8643B), 0, 0.02));
        const pm = M(0xF27BA8);
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; const p = mesh(new THREE.SphereGeometry(0.13, 10, 8), pm, Math.cos(a) * 0.22, 0.88 + Math.sin(a) * 0.22, 0); p.scale.set(1.25, 0.75, 0.4); p.rotation.z = a; g.add(p); }
        return g;
      },
    };
    return (B[key] || B.star)();
  }

  /* ---------- boot ---------- */
  let studentName = "";
  if (!API.ready()) $("#api-notice").hidden = STUDENT;
  if (!API.ready() && !STUDENT) $("#api-notice").hidden = false;

  if (!STUDENT) {
    renderPicker(); renderItems();
    showView("setup");
  } else {
    $("#tabs").hidden = true;
    for (const k of ["setup", "saved"]) $("#view-" + k).hidden = true;
    $("#view-game").hidden = false;
    $("#game-body").hidden = true; $("#gate").hidden = false;
    $("#restart").hidden = true;
    let theSet = null;
    try { studentName = sessionStorage.getItem("wp-name") || ""; } catch {}
    $("#student-name").value = studentName;
    const go = $("#gate-go"); go.disabled = true;
    const loadSet = async () => {
      if (SET_ID === "sample") return clone(SAMPLE);
      if (!API.ready()) throw new Error("선생님이 아직 연결을 마치지 않았어요.");
      const { set } = await API.get({ action: "set", id: SET_ID });
      const d = JSON.parse(set.data); d.title = d.title || set.title; return d;
    };
    setStatus("#gate-status", `<span class="spin"></span> 문제를 불러오는 중…`);
    loadSet().then((s) => {
      theSet = s; go.disabled = false; setStatus("#gate-status", "");
      $("#gate-title").textContent = s.title || "낱말 조각 공방";
    }).catch((e) => setStatus("#gate-status", esc(e.message || "문제를 불러오지 못했어요. 링크를 다시 확인해 주세요."), "err"));
    const begin = () => {
      const nm = $("#student-name").value.trim();
      if (!nm) { setStatus("#gate-status", "이름을 적어 주세요.", "err"); $("#student-name").focus(); return; }
      if (!theSet) return;
      studentName = nm; try { sessionStorage.setItem("wp-name", nm); } catch {}
      $("#gate").hidden = true; $("#game-body").hidden = false;
      $("#g-name").hidden = false; $("#g-name").textContent = nm;
      startGame(theSet);
    };
    go.addEventListener("click", begin);
    $("#student-name").addEventListener("keydown", (e) => { if (e.key === "Enter") begin(); });
  }
})();
