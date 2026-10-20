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
  const VILLAGE = params.has("village") ? (params.get("village") || "") : null;
  let villageOpen = VILLAGE || null; // ?village=2-3 이면 그 반을 바로 펼친다
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
      <button role="tab" id="tab-village" data-view="village">반별 마을</button>
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
      <div class="table-wrap"><table class="roster" id="roster" hidden><thead><tr><th>이름</th><th>끝낸 시각</th><th>걸린 시간</th><th>실수</th><th>별</th><th>기관</th></tr></thead><tbody></tbody></table></div>
    </article>
  </section>

  <section id="view-village" class="view stack" hidden>
    <article class="panel" id="vil-list">
      <div class="panel-head"><h2>반별 마을</h2><span class="pill" id="vil-count"></span><button class="btn small push" id="vil-back" hidden>← 활동으로 돌아가기</button><button class="btn small" id="reload-village">새로고침</button></div>
      <p class="hint">학생이 단어 활동 한 세트를 끝낼 때마다 그 반 마을에 기관이 하나씩 무작위로 세워져요. 마을을 누르면 크게 볼 수 있어요.</p>
      <span class="status" id="village-status"></span>
      <div class="villages" id="villages"></div>
    </article>
    <article class="panel" id="vil-detail" hidden>
      <div class="panel-head"><h2 id="vd-title"></h2><span class="pill" id="vd-level"></span><button class="btn small push" id="vd-close">← 모든 반</button></div>
      <div class="village-host" id="village-host"><canvas id="village-canvas"></canvas></div>
      <p class="hint">끌어서 돌리고, 두 손가락으로 벌리면 커져요.</p>
      <ul class="vd-list" id="vd-list"></ul>
    </article>
  </section>

  <section id="view-game" class="view stack">
    <div class="gate" id="gate" hidden>
      <article class="panel gate-card">
        <h2 class="gate-title" id="gate-title">낱말 조각 공방</h2>
        <p class="hint" id="gate-sub">학번 5자리와 이름을 적고 시작하세요. 다 끝내면 선생님께 제출되고, 우리 반 마을에 기관이 하나 세워져요.</p>
        <label class="field"><span class="lbl2">학번 이름</span><input id="student-name" class="title-input" placeholder="예: 20315 김민지" autocomplete="name" maxlength="30"></label>
        <button class="btn primary big" id="gate-go">시작하기</button>
        <button class="btn big" id="gate-village">🏘️ 반별 마을 구경하기</button>
        <span class="status" id="gate-status"></span>
      </article>
    </div>
    <div id="game-body" class="stack">
    <div class="game-head">
      <div class="stepper"><span id="st1">1 · 짝 맞추고 퍼즐 완성</span><span id="st2">2 · 빈칸 채우고 기관 짓기</span></div>
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
        <p class="hint">단어 카드를 누른 다음 빈칸을 누르세요. 맞힐 때마다 에너지가 모이고, 가득 차면 우리 반 마을에 세울 기관이 나와요.</p>
        <div class="bank" id="bank"></div>
        <ol class="blanks" id="blanks"></ol>
      </article>
      <article class="panel shelf-panel">
        <div class="panel-head"><h2>기관 건설 현장</h2><span class="hint" style="margin-left:auto">끌어서 돌려 보세요</span></div>
        <div class="energy" id="energy"><span class="bolt" aria-hidden="true">⚡</span><div class="bar"><i id="energy-fill"></i></div><b id="energy-num"></b></div>
        <div class="three-host" id="three-host"><canvas id="three"></canvas><div class="three-empty" id="three-empty">빈칸을 맞히면 에너지 블록이 쌓여요.<br>어떤 기관이 나올지는 끝나야 알 수 있어요!</div><div class="three-msg" id="three-msg"></div></div>
        <ul class="collected" id="collected"></ul>
      </article>
    </div>
    </div>
  </section>`;

  /* ---------- view switching ---------- */
  let view = null;
  function showView(v) {
    view = v;
    for (const k of ["setup", "saved", "game", "village"]) {
      $("#view-" + k).hidden = v !== k;
      $("#tab-" + k).setAttribute("aria-selected", v === k);
    }
    if (v === "game" && !STUDENT) {
      if (!G) startGame(validSet(draft) || SAMPLE);
      else requestAnimationFrame(layoutPuzzle);
    }
    if (v === "game" && STUDENT && G) requestAnimationFrame(layoutPuzzle);
    if (v === "saved") loadSets();
    if (v === "village") { closeVillage(); loadVillage(villageOpen); villageOpen = null; }
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
[{"word":"${ex}","pos":"품사","meaning":"지문 속 뜻","sentence":"쉬운 새 영어 문장","answer":"${ex}","sentenceKo":"문장 해석"}]

- meaning: 이 지문 문맥에 맞는 우리말 뜻 하나, 짧게
- sentence: 같은 뜻으로 쓴 쉬운 새 문장 (6~12단어, 지문 문장 복사 금지)
- answer: sentence 속에 들어간 그 단어의 철자 그대로`;
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
      return `<div class="item${probs.length ? " bad" : ""}" data-w="${k}">
        <div class="item-head"><span class="w">${esc(it.word)}</span>
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
    return { title: d.title || "", passage: d.passage, items: d.items.map((i) => ({ word: i.word, pos: i.pos, meaning: i.meaning, sentence: i.sentence, answer: i.answer, sentenceKo: i.sentenceKo })) };
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
      tb.innerHTML = results.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(fmtTime(r.time))}</td><td>${esc(fmtDur(r.seconds))}</td><td>${esc(r.miss)}</td><td class="stars-cell">${"★".repeat(Number(r.stars) || 0)}</td><td>${r.building && BUILDINGS[r.building] ? esc(BUILDINGS[r.building][1] + " " + BUILDINGS[r.building][0]) : ""}</td></tr>`).join("");
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
      miss: 0, energy: 0, stage: 1, t0: Date.now(), submitted: false, selEn: null, selKo: null, selChip: null, selSlot: null,
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
    updateBlankCount(); G.energy = 0; updateEnergy();
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
    m.innerHTML = `<span class="big">${esc(it.answer)}</span>${esc(it.meaning)} · 에너지 +1`;
    $("#collected").insertAdjacentHTML("beforeend", `<li><b>${esc(it.word)}</b> · ${esc(it.meaning)}</li>`);
    const g = G;
    flyEnergy(slotEl, () => {
      if (G !== g) return;
      G.energy++;
      $("#three-empty").hidden = true;
      m.classList.remove("pop"); void m.offsetWidth; m.classList.add("pop");
      updateEnergy(); addEnergyBlock();
    });
  }
  function updateEnergy() {
    const n = G.items.length, e = Math.min(G.energy, n);
    $("#energy-fill").style.width = (n ? (e / n) * 100 : 0) + "%";
    $("#energy-num").textContent = `${e} / ${n}`;
    $("#energy").classList.toggle("full", e >= n);
  }

  /* ---------- energy bolt: bursts at the answered blank, then flies into the energy bar ---------- */
  function flyEnergy(fromEl, done) {
    let box = $("#bolt-fly");
    if (!box) {
      box = document.createElement("div"); box.id = "bolt-fly"; box.className = "bolt-fly"; box.hidden = true; box.setAttribute("aria-hidden", "true");
      box.innerHTML = `<div class="pop-burst"></div><span class="bolt-icon">⚡</span><span class="bolt-plus">+1</span>`;
      document.body.append(box);
    }
    const vw = window.innerWidth, vh = window.innerHeight, size = 120;
    const fr = (fromEl || $("#blanks")).getBoundingClientRect();
    const sx = Math.min(vw - size / 2, Math.max(size / 2, fr.left + fr.width / 2));
    const sy = Math.min(vh - size / 2, Math.max(size / 2, fr.top + fr.height / 2));
    const tr = $("#energy").getBoundingClientRect();
    const tx = Math.min(vw, Math.max(0, tr.left + tr.width / 2)), ty = Math.min(vh + 40, Math.max(-40, tr.top + tr.height / 2));
    box.style.width = box.style.height = size + "px";
    box.style.left = sx + "px"; box.style.top = sy + "px";
    box.hidden = false;
    box._anim?.cancel(); clearTimeout(box._t);
    const finishFly = () => { box.hidden = true; done && done(); };
    if (reduced() || !box.animate) { box._t = setTimeout(finishFly, 400); return; }
    const T = (x, y, s) => `translate(calc(-50% + ${x}px), calc(-50% + ${y}px)) scale(${s})`;
    const dx = tx - sx, dy = ty - sy;
    box._anim = box.animate([
      { transform: T(0, 0, 0.3), opacity: 0, offset: 0 },
      { transform: T(0, 0, 1.15), opacity: 1, offset: 0.2 },
      { transform: T(0, 0, 1), opacity: 1, offset: 0.4 },
      { transform: T(dx, dy, 0.35), opacity: 0.9, offset: 1 },
    ], { duration: 1000, easing: "ease-in-out" });
    box._anim.onfinish = finishFly;
    box.querySelector(".pop-burst").animate([{ transform: "scale(.3)", opacity: 0 }, { transform: "scale(1.3)", opacity: 1, offset: 0.2 }, { transform: "scale(1.6)", opacity: 0, offset: 0.6 }, { opacity: 0 }], { duration: 1000 });
  }

  function finish() {
    const n = G.items.length, miss = G.miss;
    const stars = miss === 0 ? 3 : miss <= Math.ceil(n / 3) ? 2 : 1;
    const seconds = Math.round((Date.now() - G.t0) / 1000);
    const d = $("#done");
    d.innerHTML = `<span class="stars" aria-label="별 ${stars}개">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</span><div class="done-text"><h2 id="done-h">에너지 가득!</h2><p>${n}개 단어 · 실수 ${miss}번 · ${fmtDur(seconds)}</p><p id="submit-status"></p></div><div class="done-acts" id="done-acts"><button class="btn big" id="again">다시 하기</button></div>`;
    d.hidden = false;
    $("#again").addEventListener("click", () => startGame(G.set));
    $("#st2").className = "done";
    const real = STUDENT && studentName && SET_ID !== "sample" && API.ready();
    if (real) { if (!G.submitted) submitResult({ stars, seconds, miss, n }); return; }
    // 미리보기·연습: 마을에는 넣지 않고 기관만 뽑아 보여 준다
    const key = pickBuildingLocal();
    $("#submit-status").textContent = STUDENT ? "연습용 문제라 마을에는 세워지지 않아요." : "미리보기라 마을에는 세워지지 않아요.";
    completeBuilding(key);
  }
  async function submitResult(r) {
    G.submitted = true;
    const s = $("#submit-status");
    s.innerHTML = `<span class="spin"></span> 기관을 짓는 중…`;
    setSiteBusy(true);
    try {
      const j = await API.post({ action: "result", id: SET_ID, name: studentName, miss: r.miss, stars: r.stars, seconds: r.seconds, words: r.n });
      setSiteBusy(false);
      if (!j.building || !BUILDINGS[j.building]) { s.textContent = `${studentName} 이름으로 선생님께 제출했어요.`; return; }
      const b = BUILDINGS[j.building], cls = parseSid(studentName);
      s.textContent = j.dup
        ? `이 활동으로는 이미 ${b[0]}을(를) 지었어요. 마을에는 그대로 하나만 있어요.`
        : `${cls ? clsLabel(cls.cls) + " " : ""}마을에 세워졌어요!`;
      completeBuilding(j.building);
      if (cls) $("#done-acts").insertAdjacentHTML("afterbegin", `<button class="btn primary big" id="to-village">우리 반 마을 보기 →</button>`);
      if (cls) $("#to-village").addEventListener("click", () => openVillageFromGame(cls.cls));
    } catch (e) {
      setSiteBusy(false);
      G.submitted = false;
      s.innerHTML = `제출하지 못했어요. <button class="btn small" id="resubmit">다시 제출</button>`;
      $("#resubmit").onclick = () => submitResult(r);
    }
  }
  function completeBuilding(key) {
    const b = BUILDINGS[key]; if (!b) return;
    const tag = RARITY[b[2]];
    $("#done-h").textContent = `${b[1]} ${b[0]} 완공!`;
    const m = $("#three-msg");
    m.innerHTML = `<span class="big">${b[1]} ${esc(b[0])}</span>${tag ? `<span class="rare r${b[2]}">${tag}</span> ` : ""}새 기관이 나왔어요`;
    m.classList.remove("pop"); void m.offsetWidth; m.classList.add("pop");
    showSiteBuilding(key);
  }

  /* ---------- buildings ---------- */
  // key: [이름, 이모지, 희귀도(0 보통·1 희귀·2 전설)] — WordPuzzle.gs의 BUILDINGS와 키를 맞춘다
  const BUILDINGS = {
    hospital: ["병원", "🏥", 0], school: ["학교", "🏫", 0], fire: ["소방서", "🚒", 0], police: ["경찰서", "🚓", 0],
    library: ["도서관", "📚", 0], post: ["우체국", "📮", 0], bank: ["은행", "🏦", 0], cafe: ["카페", "☕", 0],
    bakery: ["빵집", "🥐", 0], market: ["시장", "🛒", 0], park: ["공원", "🌳", 0], station: ["기차역", "🚉", 0],
    cityhall: ["시청", "🏛️", 0], museum: ["박물관", "🖼️", 0], theater: ["극장", "🎭", 0], stadium: ["경기장", "🏟️", 0],
    pool: ["수영장", "🏊", 0], flowershop: ["꽃집", "💐", 0], windmill: ["풍차 방앗간", "🌾", 0],
    hanok: ["한옥", "🏯", 1], tower: ["전망 타워", "🗼", 1], ferris: ["관람차", "🎡", 1], lighthouse: ["등대", "🔦", 1], observatory: ["천문대", "🔭", 1],
    castle: ["성", "🏰", 2],
  };
  const RARITY = ["", "희귀", "전설"];
  function pickBuildingLocal() {
    const keys = Object.keys(BUILDINGS), w = keys.map((k) => [10, 4, 1][BUILDINGS[k][2]]);
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < keys.length; i++) { r -= w[i]; if (r < 0) return keys[i]; }
    return keys[0];
  }
  // "20315 김민지" → { grade: 2, cls: "2-3", num: 15, name: "김민지" }
  function parseSid(s) {
    const m = String(s || "").trim().match(/^(\d)(\d{2})(\d{2})\s*(.+)$/);
    if (!m || Number(m[2]) < 1) return null;
    return { grade: Number(m[1]), cls: `${Number(m[1])}-${Number(m[2])}`, num: Number(m[3]), name: m[4].trim() };
  }
  const clsLabel = (c) => { const [g, k] = String(c).split("-"); return `${g}학년 ${k}반`; };

  const MATS = new Map();
  function M(color, o = {}) {
    const k = color + JSON.stringify(o);
    if (!MATS.has(k)) {
      const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.05, flatShading: true }, o));
      m.color.convertSRGBToLinear(); m.emissive.convertSRGBToLinear(); // 렌더러가 sRGB로 내보내므로 적은 색 그대로 보이게
      MATS.set(k, m);
    }
    return MATS.get(k);
  }
  const CL = { wall: 0xF3E3C3, white: 0xF4F5F2, glass: 0x6FB8EA, door: 0x7A4B2E, red: 0xD9534F, gray: 0x9AA4AE, dark: 0x2E3A46, gold: 0xF2B632, green: 0x4CAF62, stone: 0xC9CED3, wood: 0x8A5A3B };
  function buildBuilding(key) {
    const g = new THREE.Group();
    const add = (m) => (g.add(m), m);
    const at = (geo, color, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(geo, typeof color === "number" ? M(color, o) : color); m.position.set(x, y, z); return add(m); };
    const box = (w, h, d, c, x = 0, y = 0, z = 0, o) => at(new THREE.BoxGeometry(w, h, d), c, x, y, z, o);
    const cyl = (rt, rb, h, c, x = 0, y = 0, z = 0, seg = 12, o) => at(new THREE.CylinderGeometry(rt, rb, h, seg), c, x, y, z, o);
    const cone = (r, h, c, x = 0, y = 0, z = 0, seg = 8, o) => at(new THREE.ConeGeometry(r, h, seg), c, x, y, z, o);
    const ball = (r, c, x = 0, y = 0, z = 0, o) => at(new THREE.SphereGeometry(r, 14, 10), c, x, y, z, o);
    const dome = (r, c, x = 0, y = 0, z = 0) => at(new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), c, x, y, z);
    const wins = (w, z, y, cols, rows = 1, gap = 0.22, s = 0.13, c = CL.glass) => { for (let i = 0; i < cols; i++) for (let r = 0; r < rows; r++) box(s, s, 0.02, c, -w / 2 + (i + 0.5) * (w / cols), y + r * gap, z, { metalness: 0.25, roughness: 0.3 }); };
    // 박공(삼각) 지붕: x축으로 len만큼 길고, 폭 d, 높이 h, 밑면이 y
    const prism = (len, d, h, c, x, y, z) => { const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath(); const geo = new THREE.ExtrudeGeometry(s, { depth: len, bevelEnabled: false }); geo.translate(0, 0, -len / 2); const m = at(geo, c, x, y, z); m.rotation.y = Math.PI / 2; return m; };
    const tree = (x, z, s = 1) => { cyl(0.03 * s, 0.04 * s, 0.16 * s, CL.wood, x, 0.08 * s, z, 6); cone(0.13 * s, 0.3 * s, 0x3E9E57, x, 0.3 * s, z, 7); };
    const awning = (w, z, y, c1, c2) => { const n = 6; for (let i = 0; i < n; i++) { const m = box(w / n, 0.03, 0.2, i % 2 ? c2 : c1, -w / 2 + (i + 0.5) * (w / n), y, z + 0.1); m.rotation.x = 0.45; } };
    const B = {
      hospital() {
        box(1.0, 0.9, 0.8, CL.white, 0, 0.45); box(1.04, 0.06, 0.84, CL.gray, 0, 0.93);
        wins(1.0, 0.41, 0.4, 4, 2); box(0.3, 0.28, 0.02, CL.glass, 0, 0.14, 0.41, { metalness: 0.3 });
        box(0.5, 0.5, 0.06, CL.white, 0, 1.25, 0); box(0.34, 0.1, 0.08, 0xE5484D, 0, 1.25, 0); box(0.1, 0.34, 0.08, 0xE5484D, 0, 1.25, 0);
        cyl(0.02, 0.02, 0.3, CL.gray, 0, 1.0, 0, 6);
      },
      school() {
        box(1.15, 0.55, 0.6, 0xF1D9A8, 0, 0.275); box(1.18, 0.05, 0.63, CL.red, 0, 0.575);
        wins(1.15, 0.31, 0.2, 6, 2, 0.2); box(0.2, 0.26, 0.02, CL.door, 0, 0.13, 0.31);
        box(0.3, 0.45, 0.3, 0xF1D9A8, 0, 0.8); const r = cone(0.26, 0.3, CL.red, 0, 1.17, 0, 4); r.rotation.y = Math.PI / 4;
        const ck = cyl(0.09, 0.09, 0.03, CL.white, 0, 0.85, 0.16, 16); ck.rotation.x = Math.PI / 2;
        cyl(0.012, 0.012, 0.8, CL.gray, 0.5, 0.4, 0.45, 6); box(0.18, 0.11, 0.01, 0x2E66D9, 0.59, 0.74, 0.45);
      },
      fire() {
        box(1.0, 0.62, 0.75, 0xD9433B, 0, 0.31); box(1.04, 0.05, 0.79, CL.dark, 0, 0.645);
        box(0.36, 0.38, 0.02, 0xEDEDED, -0.24, 0.19, 0.38); box(0.36, 0.38, 0.02, 0xEDEDED, 0.24, 0.19, 0.38);
        box(0.8, 0.07, 0.02, CL.white, 0, 0.5, 0.38);
        box(0.26, 0.55, 0.26, 0xB8352E, 0.38, 0.92, -0.22); box(0.3, 0.04, 0.3, CL.dark, 0.38, 1.21, -0.22);
        ball(0.05, 0xFFD23F, 0.38, 1.27, -0.22, { emissive: 0xFFB300, emissiveIntensity: 0.6 });
      },
      police() {
        box(1.0, 0.66, 0.75, 0x3B5BA9, 0, 0.33); box(1.02, 0.08, 0.77, CL.white, 0, 0.47); box(1.04, 0.05, 0.79, CL.dark, 0, 0.685);
        wins(1.0, 0.38, 0.27, 4, 1); box(0.24, 0.3, 0.02, CL.glass, 0, 0.15, 0.38, { metalness: 0.3 });
        box(0.14, 0.08, 0.1, 0xE5484D, -0.09, 0.75, 0, { emissive: 0xE5484D, emissiveIntensity: 0.5 }); box(0.14, 0.08, 0.1, 0x3D7BFF, 0.09, 0.75, 0, { emissive: 0x3D7BFF, emissiveIntensity: 0.5 });
        const st = cyl(0.09, 0.09, 0.02, CL.gold, 0, 0.58, 0.385, 5, { metalness: 0.5 }); st.rotation.x = Math.PI / 2;
      },
      library() {
        box(1.12, 0.08, 0.9, CL.stone, 0, 0.04); box(1.0, 0.55, 0.65, 0xE9DCC3, 0, 0.355, -0.05);
        for (let i = 0; i < 4; i++) cyl(0.045, 0.05, 0.52, CL.white, -0.36 + i * 0.24, 0.34, 0.33, 10);
        box(1.04, 0.05, 0.75, 0xE9DCC3, 0, 0.62, 0); prism(1.04, 0.75, 0.22, 0x9C5B3B, 0, 0.645, 0);
        [[0x2F55D4, 0.06], [0xE5484D, 0.12], [0x2FA36B, 0.18]].forEach(([c, y], i) => box(0.24 - i * 0.03, 0.06, 0.16, c, 0.36, y + 0.02, 0.48));
      },
      post() {
        box(0.92, 0.55, 0.7, 0xF28C28, 0, 0.275); box(0.96, 0.06, 0.74, CL.red, 0, 0.58);
        wins(0.92, 0.36, 0.32, 3, 1); box(0.22, 0.28, 0.02, CL.door, 0, 0.14, 0.36);
        box(0.34, 0.22, 0.03, CL.white, 0, 0.75, 0); box(0.34, 0.04, 0.035, CL.red, 0, 0.75, 0);
        cyl(0.02, 0.02, 0.2, CL.dark, 0.38, 0.1, 0.48, 6); box(0.12, 0.14, 0.1, 0xE5484D, 0.38, 0.27, 0.48);
      },
      bank() {
        box(1.12, 0.08, 0.9, CL.stone, 0, 0.04); box(1.0, 0.6, 0.65, CL.stone, 0, 0.38, -0.05);
        for (let i = 0; i < 5; i++) cyl(0.04, 0.045, 0.56, CL.white, -0.4 + i * 0.2, 0.36, 0.33, 10);
        box(1.04, 0.05, 0.75, CL.stone, 0, 0.66, 0); prism(1.04, 0.75, 0.2, CL.stone, 0, 0.685, 0);
        const coin = cyl(0.13, 0.13, 0.04, CL.gold, 0, 0.78, 0.3, 20, { metalness: 0.6, roughness: 0.25 }); coin.rotation.x = Math.PI / 2;
      },
      cafe() {
        box(0.82, 0.5, 0.65, 0x8B5E3C, 0, 0.25, -0.1); box(0.86, 0.05, 0.69, CL.dark, 0, 0.525, -0.1);
        wins(0.82, 0.235, 0.24, 2, 1, 0.2, 0.2); box(0.18, 0.28, 0.02, 0xF6EEDC, 0, 0.14, 0.235);
        awning(0.82, 0.2, 0.42, 0x2F9E5B, CL.white);
        cyl(0.09, 0.08, 0.14, CL.white, 0, 0.62, -0.1, 14); const h = at(new THREE.TorusGeometry(0.045, 0.015, 6, 12), CL.white, 0.1, 0.63, -0.1);
        [-0.28, 0.28].forEach((x) => { cyl(0.09, 0.09, 0.02, CL.white, x, 0.16, 0.45, 12); cyl(0.015, 0.015, 0.15, CL.dark, x, 0.08, 0.45, 6); });
        void h;
      },
      bakery() {
        box(0.82, 0.55, 0.65, 0xF6B8C4, 0, 0.275, -0.1); box(0.86, 0.05, 0.69, 0xC0566E, 0, 0.575, -0.1);
        wins(0.82, 0.235, 0.26, 2, 1, 0.2, 0.2); box(0.18, 0.28, 0.02, CL.door, 0, 0.14, 0.235);
        awning(0.82, 0.2, 0.46, 0xE5484D, CL.white);
        ball(0.2, 0xD9A05B, 0, 0.7, -0.1, { flatShading: false }).scale.set(1.5, 0.6, 0.8);
      },
      market() {
        box(1.15, 0.04, 1.0, 0xD8C9A8, 0, 0.02);
        [[-0.38, -0.2, 0xE5484D], [0.0, 0.22, 0xF2B632], [0.38, -0.2, 0x3D7BFF]].forEach(([x, z, c]) => {
          [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]].forEach(([dx, dz]) => cyl(0.012, 0.012, 0.38, CL.wood, x + dx, 0.21, z + dz, 5));
          prism(0.38, 0.38, 0.14, c, x, 0.4, z);
          box(0.26, 0.1, 0.18, CL.wood, x, 0.1, z); [0xF27BA8, 0x7BC96F, 0xF5A524].forEach((fc, i) => ball(0.035, fc, x - 0.08 + i * 0.08, 0.18, z));
        });
      },
      park() {
        box(1.15, 0.04, 1.15, 0x5DBB63, 0, 0.02); box(1.15, 0.045, 0.16, 0xE2D3AE, 0, 0.022); box(0.16, 0.045, 1.15, 0xE2D3AE, 0, 0.022);
        cyl(0.22, 0.24, 0.1, CL.stone, 0, 0.07, 0, 16); cyl(0.18, 0.18, 0.02, 0x4FB3E8, 0, 0.12, 0, 16, { metalness: 0.2, roughness: 0.2 });
        cyl(0.03, 0.04, 0.2, CL.stone, 0, 0.2, 0, 8); ball(0.05, 0x8FD3FF, 0, 0.32, 0);
        tree(-0.38, -0.38, 1.3); tree(0.38, -0.38, 1.1); tree(-0.38, 0.38, 1.0); tree(0.38, 0.38, 1.25);
        box(0.22, 0.03, 0.07, CL.wood, 0.3, 0.1, 0.12);
      },
      station() {
        box(1.15, 0.1, 0.55, CL.stone, 0, 0.05, -0.2);
        [[-0.48, -0.38], [0.48, -0.38], [-0.48, -0.02], [0.48, -0.02]].forEach(([x, z]) => cyl(0.02, 0.02, 0.45, CL.gray, x, 0.32, z, 6));
        box(1.15, 0.04, 0.5, 0x2E7DD8, 0, 0.56, -0.2); box(0.4, 0.12, 0.03, CL.white, 0, 0.66, -0.2);
        box(1.15, 0.02, 0.04, CL.dark, 0, 0.01, 0.2); box(1.15, 0.02, 0.04, CL.dark, 0, 0.01, 0.36);
        box(0.8, 0.24, 0.22, 0x2FA36B, -0.05, 0.15, 0.28); box(0.8, 0.04, 0.24, CL.white, -0.05, 0.28, 0.28);
        wins(0.7, 0.395, 0.18, 5, 1, 0, 0.09);
        box(0.16, 0.18, 0.2, 0x2FA36B, 0.42, 0.2, 0.28);
      },
      cityhall() {
        box(1.12, 0.55, 0.7, CL.white, 0, 0.275); box(1.14, 0.05, 0.72, CL.gray, 0, 0.575);
        wins(1.12, 0.36, 0.2, 6, 2, 0.2); box(0.24, 0.28, 0.02, CL.door, 0, 0.14, 0.36);
        cyl(0.24, 0.26, 0.18, CL.white, 0, 0.69, 0, 16); dome(0.24, 0x5FA8A0, 0, 0.78, 0);
        cyl(0.01, 0.01, 0.3, CL.gray, 0, 1.12, 0, 5); box(0.14, 0.09, 0.01, 0xE5484D, 0.07, 1.22, 0);
      },
      museum() {
        box(1.15, 0.05, 1.15, 0xE9E4D8, 0, 0.025);
        const p = cone(0.58, 0.62, CL.glass, 0, 0.36, 0, 4, { transparent: true, opacity: 0.75, metalness: 0.4, roughness: 0.1 }); p.rotation.y = Math.PI / 4;
        [[-0.45, 0.45], [0.45, 0.45]].forEach(([x, z]) => { const s = cone(0.13, 0.15, CL.glass, x, 0.12, z, 4, { transparent: true, opacity: 0.75, metalness: 0.4, roughness: 0.1 }); s.rotation.y = Math.PI / 4; });
        cyl(0.16, 0.16, 0.02, 0x4FB3E8, -0.42, 0.06, -0.42, 14);
      },
      theater() {
        box(0.95, 0.72, 0.75, 0x7A3E9D, 0, 0.36); box(0.99, 0.06, 0.79, CL.dark, 0, 0.75);
        box(0.4, 0.36, 0.02, 0xC2263B, 0, 0.18, 0.38);
        box(1.0, 0.15, 0.14, 0xF2B632, 0, 0.5, 0.44, { emissive: 0xF2B632, emissiveIntensity: 0.35 });
        for (let i = 0; i < 6; i++) ball(0.025, 0xFFF4C2, -0.42 + i * 0.168, 0.59, 0.51, { emissive: 0xFFE27A, emissiveIntensity: 0.9 });
        box(0.5, 0.3, 0.04, 0x2E3A46, 0, 0.95, 0); box(0.42, 0.22, 0.045, 0xF2B632, 0, 0.95, 0, { emissive: 0xF2B632, emissiveIntensity: 0.3 });
      },
      stadium() {
        const o = cyl(0.56, 0.6, 0.3, 0xD8DEE4, 0, 0.15, 0, 28); o.scale.z = 0.78;
        const r = cyl(0.57, 0.57, 0.06, 0x3D7BFF, 0, 0.27, 0, 28); r.scale.z = 0.79;
        const f = cyl(0.42, 0.42, 0.04, 0x4CAF62, 0, 0.29, 0, 28); f.scale.z = 0.72;
        box(0.02, 0.005, 0.5, CL.white, 0, 0.312, 0);
        [[-0.48, -0.36], [0.48, -0.36], [-0.48, 0.36], [0.48, 0.36]].forEach(([x, z]) => { cyl(0.012, 0.012, 0.7, CL.gray, x, 0.35, z, 5); box(0.1, 0.06, 0.04, 0xFFF4C2, x, 0.72, z, { emissive: 0xFFE27A, emissiveIntensity: 0.8 }); });
      },
      pool() {
        box(1.12, 0.1, 0.92, 0xE6EEF2, 0, 0.05); box(0.84, 0.02, 0.62, 0x3BB3E8, 0, 0.1, 0, { metalness: 0.2, roughness: 0.15 });
        for (let i = 1; i < 4; i++) box(0.84, 0.005, 0.01, CL.white, 0, 0.112, -0.31 + i * 0.155);
        box(0.12, 0.45, 0.12, 0xF2B632, 0.45, 0.32, -0.35); const s = box(0.1, 0.02, 0.5, 0xF5A524, 0.45, 0.32, -0.08); s.rotation.x = 0.7;
        cyl(0.01, 0.01, 0.4, CL.white, -0.45, 0.3, 0.38, 5); cone(0.16, 0.08, 0xF27BA8, -0.45, 0.52, 0.38, 10);
      },
      flowershop() {
        box(0.82, 0.5, 0.62, 0xFFF1D6, 0, 0.25, -0.12); box(0.86, 0.05, 0.66, 0x4CAF62, 0, 0.525, -0.12);
        wins(0.82, 0.195, 0.24, 2, 1, 0.2, 0.2); box(0.18, 0.28, 0.02, 0x4CAF62, 0, 0.14, 0.195);
        awning(0.82, 0.18, 0.42, 0xF27BA8, CL.white);
        [0xE5484D, 0xF2B632, 0xF27BA8, 0x9B6BDE, 0xF5A524].forEach((c, i) => { const x = -0.36 + i * 0.18; cyl(0.05, 0.04, 0.08, 0xC8643B, x, 0.04, 0.42, 8); ball(0.055, c, x, 0.12, 0.42); });
      },
      windmill() {
        box(0.9, 0.04, 0.9, 0x9BCB6B, 0, 0.02);
        cyl(0.18, 0.32, 0.9, CL.white, 0, 0.47, 0, 8); cone(0.22, 0.22, CL.red, 0, 1.03, 0, 8);
        box(0.12, 0.2, 0.02, CL.door, 0, 0.12, 0.29);
        const hub = new THREE.Group(); hub.position.set(0, 0.85, 0.22); g.add(hub);
        for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); arm.rotation.z = (i * Math.PI) / 2; const bl = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.015), M(0xC69A6B)); bl.position.y = 0.28; arm.add(bl); hub.add(arm); }
        hub.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), M(CL.dark)));
        hub.userData.spin = [0, 0, 0.8];
      },
      hanok() {
        box(1.12, 0.12, 0.78, 0xA9A49A, 0, 0.06); box(0.92, 0.42, 0.56, 0xF2E6CF, 0, 0.33);
        for (let i = 0; i < 5; i++) box(0.04, 0.42, 0.04, 0x6B3F23, -0.44 + i * 0.22, 0.33, 0.29);
        box(0.92, 0.04, 0.04, 0x6B3F23, 0, 0.52, 0.29);
        [[-0.22], [0.22]].forEach(([x]) => box(0.16, 0.24, 0.02, 0xFFF8E8, x, 0.32, 0.3));
        const r = cone(0.78, 0.36, 0x4A4F57, 0, 0.72, 0, 4); r.rotation.y = Math.PI / 4; r.scale.set(1.25, 1, 0.85);
        box(0.6, 0.05, 0.06, 0x3B3F46, 0, 0.9, 0);
      },
      tower() {
        cone(0.55, 0.3, 0x5DBB63, 0, 0.15, 0, 10);
        cyl(0.045, 0.08, 1.2, CL.white, 0, 0.85, 0, 10);
        cyl(0.2, 0.16, 0.16, CL.white, 0, 1.35, 0, 16); cyl(0.21, 0.21, 0.06, CL.glass, 0, 1.32, 0, 16, { metalness: 0.3, roughness: 0.2 });
        cyl(0.012, 0.02, 0.45, 0xE5484D, 0, 1.65, 0, 6); ball(0.03, 0xFF6B6B, 0, 1.88, 0, { emissive: 0xFF3B3B, emissiveIntensity: 0.8 });
      },
      ferris() {
        box(1.0, 0.05, 0.5, CL.stone, 0, 0.025);
        [-0.12, 0.12].forEach((z) => { const a = box(0.04, 0.75, 0.04, CL.gray, -0.15, 0.37, z); a.rotation.z = -0.38; const b = box(0.04, 0.75, 0.04, CL.gray, 0.15, 0.37, z); b.rotation.z = 0.38; });
        const wheel = new THREE.Group(); wheel.position.set(0, 0.72, 0); g.add(wheel);
        wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.02, 6, 32), M(0xE5484D)));
        const cols = [0xF2B632, 0x3D7BFF, 0x2FA36B, 0xF27BA8, 0x9B6BDE, 0xF5A524, 0x38C6D9, 0xE5484D];
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const sp = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.46, 0.015), M(CL.white)); sp.position.set(Math.cos(a) * 0.23, Math.sin(a) * 0.23, 0); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
          const cab = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.09, 0.12), M(cols[i])); cab.position.set(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0); wheel.add(cab);
        }
        wheel.userData.spin = [0, 0, 0.35];
      },
      lighthouse() {
        const rk = at(new THREE.DodecahedronGeometry(0.42), 0x8F969E, 0, 0.12, 0); rk.scale.y = 0.45;
        for (let i = 0; i < 4; i++) cyl(0.2 - (i + 1) * 0.02, 0.2 - i * 0.02, 0.24, i % 2 ? CL.white : 0xE5484D, 0, 0.32 + i * 0.24, 0, 14);
        cyl(0.12, 0.12, 0.16, 0xFFE27A, 0, 1.36, 0, 12, { emissive: 0xFFC83D, emissiveIntensity: 0.9, transparent: true, opacity: 0.9 });
        cone(0.16, 0.18, 0xE5484D, 0, 1.53, 0, 12); box(0.34, 0.02, 0.34, CL.dark, 0, 1.27, 0);
      },
      observatory() {
        box(0.9, 0.06, 0.9, CL.stone, 0, 0.03);
        cyl(0.4, 0.42, 0.42, CL.white, 0, 0.27, 0, 20); dome(0.4, 0xC9D1DA, 0, 0.48, 0);
        const sl = box(0.12, 0.42, 0.06, CL.dark, 0, 0.7, 0.28); sl.rotation.x = -0.75;
        const sc = cyl(0.05, 0.06, 0.4, 0x3E4A58, 0, 0.82, 0.18, 10); sc.rotation.x = 0.7;
        box(0.14, 0.24, 0.02, CL.door, 0, 0.12, 0.415);
      },
      castle() {
        box(1.0, 0.36, 1.0, 0xBFB7A8, 0, 0.18);
        for (let i = 0; i < 5; i++) for (const z of [-0.5, 0.5]) box(0.08, 0.08, 0.06, 0xBFB7A8, -0.4 + i * 0.2, 0.4, z);
        [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([x, z]) => { cyl(0.14, 0.15, 0.62, 0xCFC8BA, x, 0.31, z, 12); cone(0.18, 0.3, 0x3D63C9, x, 0.77, z, 12); });
        box(0.42, 0.75, 0.42, 0xD9D2C4, 0, 0.55, -0.05); cone(0.32, 0.38, 0x3D63C9, 0, 1.11, -0.05, 4).rotation.y = Math.PI / 4;
        cyl(0.01, 0.01, 0.25, CL.gray, 0, 1.4, -0.05, 5); box(0.14, 0.08, 0.01, CL.gold, 0.07, 1.48, -0.05);
        box(0.22, 0.26, 0.04, 0x5A3A26, 0, 0.13, 0.5);
        wins(0.42, 0.165, 0.62, 2, 2, 0.2, 0.08, 0x3E4A58);
      },
    };
    (B[key] || B.hospital)();
    return g;
  }
  function spinners(root) { const out = []; root.traverse((o) => { if (o.userData.spin) out.push(o); }); return out; }
  function disposeScene(scene) { scene.traverse((o) => { o.geometry?.dispose?.(); if (o.material?.map) o.material.map.dispose(); if (o.isSprite) o.material.dispose(); }); }
  function textSprite(text, { size = 0.22, bg = "rgba(21,37,44,.82)", fg = "#fff", weight = 600 } = {}) {
    const c = document.createElement("canvas"), x = c.getContext("2d"), fs = 44;
    x.font = `${weight} ${fs}px "IBM Plex Sans KR", system-ui, sans-serif`;
    const w = Math.ceil(x.measureText(text).width) + 36, h = fs + 24;
    c.width = w; c.height = h;
    x.font = `${weight} ${fs}px "IBM Plex Sans KR", system-ui, sans-serif`;
    x.fillStyle = bg; const r = h / 2; x.beginPath(); x.moveTo(r, 0); x.arcTo(w, 0, w, h, r); x.arcTo(w, h, 0, h, r); x.arcTo(0, h, 0, 0, r); x.arcTo(0, 0, w, 0, r); x.fill();
    x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(text, w / 2, h / 2 + 2);
    const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding; tex.anisotropy = 4;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
    sp.scale.set(size * (w / h), size, 1);
    return sp;
  }
  function shadowDisc(r) {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 24), M(0x000000, { transparent: true, opacity: 0.12, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.006; return m;
  }

  /* ---------- Three.js construction site (stage 2) ---------- */
  let T3 = null;
  const SITE_H = 1.5;
  function initThree() {
    disposeThree();
    const host = $("#three-host");
    if (!window.THREE) { $("#three-empty").textContent = "이 기기에서는 3D를 불러오지 못했어요. 에너지는 위 막대에 모여요."; return; }
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: $("#three"), antialias: true, alpha: true }); }
    catch { $("#three-empty").textContent = "이 기기에서는 3D를 표시할 수 없어요. 에너지는 위 막대에 모여요."; return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputEncoding = THREE.sRGBEncoding;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8796a8, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(3, 6, 5); scene.add(sun);
    const root = new THREE.Group(); scene.add(root);
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.8, 0.2, 48), new THREE.MeshStandardMaterial({ color: groundColor(), roughness: 0.9 }));
    ground.position.y = -0.1; root.add(ground);
    const dirt = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.03, 1.5), M(0xC9B48A)); dirt.position.y = 0.015; root.add(dirt);
    // 비계(뼈대) + 물음표 간판: 에너지가 모일수록 블록이 쌓인다
    const site = new THREE.Group(); root.add(site);
    const pole = M(0xF5A524);
    [[-0.62, -0.62], [0.62, -0.62], [-0.62, 0.62], [0.62, 0.62]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.BoxGeometry(0.05, SITE_H + 0.1, 0.05), pole); p.position.set(x, (SITE_H + 0.1) / 2, z); site.add(p); });
    for (const y of [SITE_H / 2, SITE_H + 0.05]) for (const [w, d, x, z] of [[1.29, 0.04, 0, -0.62], [1.29, 0.04, 0, 0.62], [0.04, 1.29, -0.62, 0], [0.04, 1.29, 0.62, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), pole); b.position.set(x, y, z); site.add(b); }
    const sign = textSprite("?", { size: 0.5, bg: "rgba(243,177,43,.95)", fg: "#1B1400", weight: 800 }); sign.position.set(0, SITE_H + 0.45, 0); site.add(sign);
    camera.position.set(0, 2.3, 4.6); camera.lookAt(0, 0.7, 0);
    T3 = { renderer, scene, camera, root, ground, site, blocks: [], building: null, spins: [], rot: 0.5, dragging: null, raf: 0, last: performance.now(), host, busy: false };
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
      if (!T3.dragging && !reduced()) T3.rot += dt * (T3.busy ? 1.2 : 0.18);
      T3.root.rotation.y = T3.rot;
      const t = now / 1000;
      for (const b of T3.blocks) {
        const age = t - b.t0;
        b.mesh.scale.setScalar(reduced() || age > 0.5 ? 1 : Math.max(0.001, easeOutBack(age / 0.5)));
        b.mesh.material.emissiveIntensity = 0.35 + 0.15 * Math.sin(t * 3 + b.i);
      }
      if (T3.building) {
        const age = t - T3.building.t0;
        T3.building.obj.scale.setScalar(T3.building.s * (reduced() || age > 0.7 ? 1 : Math.max(0.001, easeOutBack(age / 0.7))));
        if (T3.site.visible) { const s = Math.max(0, 1 - age / 0.35); T3.site.scale.setScalar(s); if (s <= 0) T3.site.visible = false; }
      }
      if (!reduced()) for (const s of T3.spins) { const [x, y, z] = s.userData.spin; s.rotation.x += x * dt; s.rotation.y += y * dt; s.rotation.z += z * dt; }
      renderer.render(scene, camera);
    };
    T3.raf = requestAnimationFrame(loop);
  }
  function addEnergyBlock() {
    if (!T3) return;
    const n = G.items.length, i = T3.blocks.length; if (i >= n) return;
    const h = SITE_H / n;
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.1, h * 0.86, 1.1), new THREE.MeshStandardMaterial({ color: 0xFFD45C, emissive: 0xF3B12B, emissiveIntensity: 0.4, transparent: true, opacity: 0.82, roughness: 0.4 }));
    mesh.position.y = h * i + h / 2;
    T3.site.add(mesh); T3.blocks.push({ mesh, i, t0: performance.now() / 1000 });
  }
  function setSiteBusy(v) { if (T3) T3.busy = v; }
  function showSiteBuilding(key) {
    if (!T3) return;
    if (T3.building) { T3.root.remove(T3.building.obj); disposeScene(T3.building.obj); }
    const obj = buildBuilding(key);
    const h = new THREE.Box3().setFromObject(obj).max.y; // 키 큰 기관(타워·등대)도 화면에 들어오게
    obj.scale.setScalar(0.001);
    T3.root.add(obj); T3.building = { obj, s: Math.min(1.6, 2.4 / Math.max(h, 0.1)), t0: performance.now() / 1000 }; T3.spins = spinners(obj);
  }
  function groundColor() { return new THREE.Color(cssVar("--line") || "#cfdad6"); }
  function disposeThree() {
    if (!T3) return;
    cancelAnimationFrame(T3.raf); T3.ro?.disconnect(); T3.mql?.removeEventListener?.("change", T3.onTheme);
    disposeScene(T3.scene); T3.ground.material.dispose(); T3.blocks.forEach((b) => b.mesh.material.dispose());
    T3.renderer.dispose();
    const h = T3.host; h.onpointerdown = h.onpointermove = h.onpointerup = h.onpointercancel = null;
    T3 = null;
  }
  const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };

  /* ======================================================
     VILLAGE — 반마다 마을 하나, 기관 = 학생이 끝낸 활동 1세트
     ====================================================== */
  const LOT = 1.6;
  const LEVELS = [[0, "빈 땅"], [1, "새싹 마을"], [5, "작은 마을"], [10, "읍내"], [20, "소도시"], [35, "도시"], [60, "대도시"]];
  const levelOf = (n) => LEVELS.filter(([m]) => n >= m).pop()[1];
  // 가운데 광장(0,0)에서 바깥으로 한 칸씩 나선형으로 자리를 채운다
  function lotCells(count) {
    const cells = [];
    for (let ring = 1; cells.length < count; ring++) {
      const ringCells = [];
      for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) if (Math.max(Math.abs(i), Math.abs(j)) === ring) ringCells.push([i, j]);
      ringCells.sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
      cells.push(...ringCells);
    }
    return cells.slice(0, count);
  }
  const rand = (seed) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  function buildVillage(cls, list, { labels = false } = {}) {
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7d8c9c, 0.95));
    const sun = new THREE.DirectionalLight(0xffffff, 0.85); sun.position.set(4, 8, 6); scene.add(sun);
    const root = new THREE.Group(); scene.add(root);
    const n = list.length;
    const ring = n ? Math.max(1, ...lotCells(n).map(([i, j]) => Math.max(Math.abs(i), Math.abs(j)))) : 1;
    const half = (ring + 0.5) * LOT + 0.35;
    const base = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.24, half * 2), M(0x8C7A5B)); base.position.y = -0.12; root.add(base);
    const road = new THREE.Mesh(new THREE.BoxGeometry(half * 2 - 0.2, 0.02, half * 2 - 0.2), M(0x9AA1A8)); road.position.y = 0.01; root.add(road);
    const cellsAll = [];
    for (let i = -ring; i <= ring; i++) for (let j = -ring; j <= ring; j++) cellsAll.push([i, j]);
    const used = lotCells(n);
    const usedKey = new Set(used.map(([i, j]) => i + "," + j));
    const rnd = rand(([...String(cls)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) % 2147483646) + 1);
    for (const [i, j] of cellsAll) {
      const x = i * LOT, z = j * LOT;
      const center = i === 0 && j === 0;
      const lot = new THREE.Mesh(new THREE.BoxGeometry(LOT - 0.34, 0.04, LOT - 0.34), M(center ? 0xE2D9C6 : 0x6CBF6A)); lot.position.set(x, 0.04, z); root.add(lot);
      if (!center && !usedKey.has(i + "," + j)) {
        // 빈 땅: 나무 몇 그루
        const k = 1 + Math.floor(rnd() * 3);
        for (let t = 0; t < k; t++) {
          const tx = x + (rnd() - 0.5) * 0.8, tz = z + (rnd() - 0.5) * 0.8, s = 0.8 + rnd() * 0.6;
          const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.04 * s, 0.16 * s, 6), M(CL.wood)); trunk.position.set(tx, 0.06 + 0.08 * s, tz); root.add(trunk);
          const top = new THREE.Mesh(new THREE.ConeGeometry(0.15 * s, 0.34 * s, 7), M(0x3E9E57)); top.position.set(tx, 0.06 + 0.33 * s, tz); root.add(top);
        }
      }
    }
    // 광장: 분수 + 반 이름 깃발
    const fountain = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.38, 0.12, 20), M(CL.stone)); fountain.position.set(0, 0.12, 0); root.add(fountain);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.02, 20), M(0x4FB3E8, { metalness: 0.2, roughness: 0.2 })); water.position.set(0, 0.18, 0); root.add(water);
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), M(CL.gray)); flagPole.position.set(0, 0.6, 0); root.add(flagPole);
    const flag = textSprite(clsLabel(cls), { size: labels ? 0.34 : 0.55, bg: "rgba(36,72,216,.95)", weight: 700 }); flag.position.set(0, labels ? 1.35 : 1.5, 0); root.add(flag);
    const spins = [];
    list.forEach((b, idx) => {
      const [i, j] = used[idx]; const x = i * LOT, z = j * LOT;
      const g = buildBuilding(b.building);
      // 길(광장) 쪽을 바라보게
      g.rotation.y = Math.abs(i) >= Math.abs(j) ? (i > 0 ? -Math.PI / 2 : Math.PI / 2) : (j > 0 ? Math.PI : 0);
      g.position.set(x, 0.06, z); root.add(g); spins.push(...spinners(g));
      const sh = shadowDisc(0.62); sh.position.set(x, 0.065, z); root.add(sh);
      if (labels) { const lb = textSprite(b.name || "", { size: 0.2 }); const bb = new THREE.Box3().setFromObject(g); lb.position.set(x, bb.max.y + 0.2, z); root.add(lb); }
    });
    return { scene, root, half, spins };
  }
  function frameCamera(camera, half, aspect, zoom = 1) {
    const d = (half * 2.6 + 1.2) / Math.min(1.25, Math.max(0.7, aspect)) / zoom;
    camera.position.set(0, d * 0.62, d * 0.78); camera.lookAt(0, 0, 0);
  }

  let VIL = null; // 반별 데이터
  let VD = null;  // 크게 보기 렌더러
  async function loadVillage(openCls) {
    const st = $("#village-status");
    if (!API.ready()) { st.textContent = "구글 시트가 연결되면 마을을 볼 수 있어요."; return; }
    setStatus("#village-status", `<span class="spin"></span> 마을을 불러오는 중…`);
    try {
      const j = await API.get({ action: "village" });
      if (!j.classes) throw new Error("선생님이 시트 코드를 새 버전으로 바꿔야 마을이 보여요.");
      VIL = j.classes;
      renderVillages();
      setStatus("#village-status", "");
      if (openCls) openVillage(openCls);
    } catch (e) { setStatus("#village-status", esc(e.message || "불러오지 못했어요."), "err"); }
  }
  function sortedClasses() {
    return Object.keys(VIL || {}).sort((a, b) => { const [ga, ca] = a.split("-").map(Number), [gb, cb] = b.split("-").map(Number); return ga - gb || ca - cb; });
  }
  function renderVillages() {
    const box = $("#villages");
    const keys = sortedClasses();
    $("#vil-count").textContent = `${keys.length}개 반`;
    if (!keys.length) { box.innerHTML = `<p class="notice">아직 세워진 기관이 없어요. 학생이 단어 활동을 끝내면 반마다 마을이 생겨요.</p>`; return; }
    let lastG = null;
    box.innerHTML = keys.map((k) => {
      const list = VIL[k], g = k.split("-")[0];
      const rare = list.filter((b) => BUILDINGS[b.building]?.[2] > 0).map((b) => BUILDINGS[b.building][1]).join("");
      const head = g !== lastG ? `<h3 class="grade-h">${g}학년</h3>` : ""; lastG = g;
      return `${head}<button class="vcard" data-cls="${esc(k)}"><span class="vimg"><img alt="${esc(clsLabel(k))} 마을" data-cls="${esc(k)}"></span><span class="vinfo"><b>${esc(clsLabel(k))}</b><span>${esc(levelOf(list.length))} · 기관 ${list.length}개</span>${rare ? `<span class="vrare" title="희귀 기관">${rare}</span>` : ""}</span></button>`;
    }).join("");
    snapshotVillages(keys);
  }
  // 렌더러 하나로 반마다 사진을 찍어 카드에 넣는다 (태블릿에서 WebGL 창을 여러 개 띄우지 않으려고)
  function snapshotVillages(keys) {
    if (!window.THREE) return;
    let r;
    try { r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); } catch { return; }
    const W = 560, H = 380; r.setPixelRatio(1); r.setSize(W, H, false); r.outputEncoding = THREE.sRGBEncoding;
    const cam = new THREE.PerspectiveCamera(36, W / H, 0.1, 200);
    for (const k of keys) {
      const v = buildVillage(k, VIL[k]);
      v.root.rotation.y = -0.5; frameCamera(cam, v.half, W / H);
      r.render(v.scene, cam);
      const img = $(`img[data-cls="${CSS.escape(k)}"]`); if (img) img.src = r.domElement.toDataURL("image/png");
      disposeScene(v.scene);
    }
    r.dispose(); r.forceContextLoss?.();
  }
  function openVillage(cls) {
    const list = VIL?.[cls];
    if (!list) { setStatus("#village-status", `${esc(clsLabel(cls))}에는 아직 기관이 없어요.`); return; }
    $("#vil-list").hidden = true; $("#vil-detail").hidden = false;
    $("#vd-title").textContent = `${clsLabel(cls)} 마을`;
    $("#vd-level").textContent = `${levelOf(list.length)} · 기관 ${list.length}개`;
    const byName = new Map();
    list.forEach((b) => { if (!byName.has(b.name)) byName.set(b.name, []); byName.get(b.name).push(b.building); });
    $("#vd-list").innerHTML = [...byName].map(([nm, bs]) => `<li><b>${esc(nm)}</b> ${bs.map((k) => `<span title="${esc(BUILDINGS[k]?.[0] || "")}">${BUILDINGS[k]?.[1] || "🏠"} ${esc(BUILDINGS[k]?.[0] || "")}</span>`).join(" ")}</li>`).join("");
    initVillageView(cls, list);
    window.scrollTo({ top: 0, behavior: reduced() ? "auto" : "smooth" });
  }
  function closeVillage() {
    disposeVillageView();
    $("#vil-detail").hidden = true; $("#vil-list").hidden = false;
  }
  function initVillageView(cls, list) {
    disposeVillageView();
    const host = $("#village-host");
    if (!window.THREE) return;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas: $("#village-canvas"), antialias: true, alpha: true }); } catch { return; }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.outputEncoding = THREE.sRGBEncoding;
    const v = buildVillage(cls, list, { labels: true });
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    VD = { renderer, camera, ...v, rot: -0.5, zoom: 1, pts: new Map(), raf: 0, last: performance.now(), host, idle: 0 };
    const resize = () => { const w = host.clientWidth, h = host.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
    VD.ro = new ResizeObserver(resize); VD.ro.observe(host); resize();
    // 한 손가락 끌기 = 돌리기, 두 손가락 = 확대/축소, 휠 = 확대/축소
    host.onpointerdown = (e) => { VD.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); VD.start = { rot: VD.rot, zoom: VD.zoom, x: e.clientX, dist: pinchDist() }; try { host.setPointerCapture(e.pointerId); } catch {} };
    host.onpointermove = (e) => {
      if (!VD || !VD.pts.has(e.pointerId)) return;
      VD.pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); VD.idle = 0;
      if (VD.pts.size >= 2) { const d = pinchDist(); if (VD.start.dist) VD.zoom = clampZoom(VD.start.zoom * (d / VD.start.dist)); }
      else VD.rot = VD.start.rot + (e.clientX - VD.start.x) * 0.01;
    };
    const up = (e) => { if (!VD) return; VD.pts.delete(e.pointerId); const p = [...VD.pts.values()][0]; VD.start = { rot: VD.rot, zoom: VD.zoom, x: p ? p.x : 0, dist: pinchDist() }; };
    host.onpointerup = host.onpointercancel = up;
    host.onwheel = (e) => { e.preventDefault(); VD.zoom = clampZoom(VD.zoom * (e.deltaY < 0 ? 1.1 : 0.9)); VD.idle = 0; };
    const loop = (now) => {
      if (!VD) return;
      VD.raf = requestAnimationFrame(loop);
      if ($("#view-village").hidden) return;
      const dt = Math.min(0.05, (now - VD.last) / 1000); VD.last = now; VD.idle += dt;
      if (!VD.pts.size && VD.idle > 2 && !reduced()) VD.rot += dt * 0.12;
      VD.root.rotation.y = VD.rot;
      if (!reduced()) for (const s of VD.spins) { const [x, y, z] = s.userData.spin; s.rotation.x += x * dt; s.rotation.y += y * dt; s.rotation.z += z * dt; }
      frameCamera(camera, VD.half, camera.aspect, VD.zoom);
      renderer.render(VD.scene, camera);
    };
    VD.raf = requestAnimationFrame(loop);
  }
  function pinchDist() { if (!VD || VD.pts.size < 2) return 0; const [a, b] = [...VD.pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); }
  const clampZoom = (z) => Math.min(3.5, Math.max(0.6, z));
  function disposeVillageView() {
    if (!VD) return;
    cancelAnimationFrame(VD.raf); VD.ro?.disconnect(); disposeScene(VD.scene); VD.renderer.dispose();
    const h = VD.host; h.onpointerdown = h.onpointermove = h.onpointerup = h.onpointercancel = h.onwheel = null;
    VD = null;
  }
  $("#villages").addEventListener("click", (e) => { const c = e.target.closest(".vcard"); if (c) openVillage(c.dataset.cls); });
  $("#vd-close").addEventListener("click", closeVillage);
  $("#reload-village").addEventListener("click", () => { closeVillage(); loadVillage(); });
  // 학생 화면: 활동 중에도 앱 안에서 마을을 보고 다시 돌아온다
  function openVillageFromGame(cls) {
    villageOpen = cls || null;
    $("#vil-back").hidden = false;
    showView("village");
  }
  $("#vil-back").addEventListener("click", () => { closeVillage(); showView("game"); window.scrollTo({ top: 0 }); });

  /* ---------- boot ---------- */
  let studentName = "";
  if (!API.ready()) $("#api-notice").hidden = STUDENT;
  if (!API.ready() && !STUDENT) $("#api-notice").hidden = false;

  if (VILLAGE !== null) {
    $("#tabs").hidden = true;
    showView("village");
  } else if (!STUDENT) {
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
    $("#gate-village").addEventListener("click", () => openVillageFromGame(null));
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
      if (!nm) { setStatus("#gate-status", "학번과 이름을 적어 주세요.", "err"); $("#student-name").focus(); return; }
      if (SET_ID !== "sample" && !parseSid(nm)) { setStatus("#gate-status", "학번 5자리 다음에 이름을 적어 주세요. 예: 20315 김민지", "err"); $("#student-name").focus(); return; }
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
