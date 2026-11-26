/* Fischerprüfung Hessen – Probeklausur */

const STORAGE_KEY = "fischerpruefung_hessen_progress_v1";
const LEGACY_STORAGE_KEY = "fk_hessen_progress_v1";
const THEME_STORAGE_KEY = "fischerpruefung_hessen_theme";
const EXAM_DURATION_SECONDS = 120 * 60; // 120 Minuten nach HFischV
const EXAM_QUESTIONS_PER_CAT = 12;      // 12 Fragen * 5 Sachgebiete = 60 Fragen
const EXAM_MIN_TOTAL = 45;              // Mindestens 45/60 gesamt
const EXAM_MIN_PER_CAT = 9;             // Mindestens 9/12 pro Sachgebiet

const state = {
  questions: [],
  categories: [],
  progress: loadProgress(),
  random: {
    items: [],
    pos: 0,
    score: 0,
    answered: false,
    selectedKey: null,
  },
  exam: {
    active: false,
    items: [],
    answers: {},
    flagged: new Set(),
    currentIdx: 0,
    remainingSeconds: EXAM_DURATION_SECONDS,
    timerId: null,
    results: null,
    reviewFilter: "all",
    reviewCat: "all",
    promptedAllAnswered: false,
  },
};

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        examHistory: parsed.examHistory || [],
        questionStatus: parsed.questionStatus || {},
      };
    }
  } catch {
    // Ignore corrupted storage
  }
  return {
    examHistory: [],
    questionStatus: {},
  };
}

function saveProgress() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      examHistory: state.progress.examHistory.slice(0, 10),
      questionStatus: state.progress.questionStatus,
    })
  );
  updateCatalogStat();
}

function updateCatalogStat() {
  const el = document.getElementById("catalogStat");
  if (!el || state.questions.length === 0) return;
  const correct = state.questions.filter(
    (q) => state.progress.questionStatus[questionUid(q)] === "correct"
  ).length;
  const wrong = state.questions.filter(
    (q) => state.progress.questionStatus[questionUid(q)] === "wrong"
  ).length;
  const open = state.questions.length - correct - wrong;
  el.textContent = `Richtig: ${correct} · Falsch: ${wrong} · Offen: ${open}`;
}

function optionNum(key) {
  return { a: "1", b: "2", c: "3", d: "4" }[key] || key;
}

function questionUid(q) {
  return `${q.kategorie}::${q.nummer}`;
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function populateReviewCategories() {
  const reviewSelect = document.getElementById("reviewCategoryFilter");
  const catalogSelect = document.getElementById("catalogCategoryFilter");
  state.categories.forEach((cat) => {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    reviewSelect.appendChild(opt);

    const opt2 = document.createElement("option");
    opt2.value = cat;
    opt2.textContent = cat;
    catalogSelect.appendChild(opt2);
  });
}

function renderExamHistory() {
  const box = document.getElementById("examHistoryBox");
  const list = document.getElementById("examHistoryList");
  const history = state.progress.examHistory;
  if (!history.length) {
    box.classList.add("hidden");
    return;
  }
  box.classList.remove("hidden");
  list.innerHTML = "";
  history.forEach((h, idx) => {
    const row = document.createElement("div");
    row.className = "history-item";
    row.innerHTML = `
      <span>${h.date} · Dauer: ${formatTime(h.elapsedSeconds)}</span>
      <span><strong>${h.totalCorrect} / 60</strong></span>
      <span class="badge ${h.passed ? "badge-success" : "badge-danger"}">
        ${h.passed ? "Bestanden" : "Nicht bestanden"}
      </span>
    `;
    if (Array.isArray(h.items) && h.items.length > 0) {
      const viewBtn = document.createElement("button");
      viewBtn.className = "btn btn-ghost small";
      viewBtn.textContent = "Auswertung";
      viewBtn.addEventListener("click", () => openSavedExam(idx));
      row.appendChild(viewBtn);
    }
    list.appendChild(row);
  });
}

function openSavedExam(historyIdx) {
  const entry = state.progress.examHistory[historyIdx];
  if (!entry || !Array.isArray(entry.items)) return;

  const qByUid = new Map(state.questions.map((q) => [questionUid(q), q]));
  const items = [];
  const answers = {};
  entry.items.forEach((saved, idx) => {
    const fullQ = qByUid.get(`${saved.k}::${saved.n}`);
    if (fullQ) {
      items.push(fullQ);
      if (saved.u) answers[idx] = saved.u;
    }
  });

  state.exam.items = items;
  state.exam.answers = answers;
  state.exam.reviewFilter = "all";
  state.exam.reviewCat = "all";
  state.exam.results = {
    totalCorrect: entry.totalCorrect,
    perCategory: entry.perCategory,
    failedCategories: entry.failedCategories || [],
    passed: entry.passed,
    elapsedSeconds: entry.elapsedSeconds,
    autoSubmitted: Boolean(entry.autoSubmitted),
  };

  document.getElementById("randomPromptBox").classList.add("hidden");
  document.getElementById("examStartScreen").classList.add("hidden");
  document.getElementById("catalogSearchSection").classList.add("hidden");
  document.getElementById("examActiveScreen").classList.add("hidden");
  renderExamResults();
}

function startExam() {
  const items = [];
  state.categories.forEach((cat) => {
    const catPool = state.questions.filter((q) => q.kategorie === cat);
    items.push(...shuffle(catPool).slice(0, EXAM_QUESTIONS_PER_CAT));
  });

  if (state.exam.timerId) clearInterval(state.exam.timerId);

  state.exam = {
    active: true,
    items,
    answers: {},
    flagged: new Set(),
    currentIdx: 0,
    remainingSeconds: EXAM_DURATION_SECONDS,
    timerId: null,
    results: null,
    reviewFilter: "all",
    reviewCat: "all",
    promptedAllAnswered: false,
  };

  document.getElementById("randomPromptBox").classList.add("hidden");
  document.getElementById("examStartScreen").classList.add("hidden");
  document.getElementById("catalogSearchSection").classList.add("hidden");
  document.getElementById("examResultsScreen").classList.add("hidden");
  document.getElementById("examActiveScreen").classList.remove("hidden");

  updateTimerDisplay();
  state.exam.timerId = setInterval(() => {
    state.exam.remainingSeconds -= 1;
    updateTimerDisplay();
    if (state.exam.remainingSeconds <= 0) {
      finishExam(true);
    }
  }, 1000);

  renderExamQuestion();
  renderExamNavigator();
}

function updateTimerDisplay() {
  const el = document.getElementById("examTimer");
  el.textContent = formatTime(Math.max(0, state.exam.remainingSeconds));
  el.classList.toggle("urgent", state.exam.remainingSeconds <= 600);
}

function renderExamQuestion() {
  const { items, currentIdx, answers, flagged } = state.exam;
  const q = items[currentIdx];
  const answeredCount = Object.keys(answers).length;

  document.getElementById("examQuestionCounter").textContent = `Frage ${currentIdx + 1} / ${items.length}`;
  document.getElementById("examAnsweredCounter").textContent = `${answeredCount} / ${items.length} beantwortet`;
  document.getElementById("examCurrentCategory").textContent = q.kategorie;
  document.getElementById("examCatalogNumber").textContent = `Katalog-Nr. ${q.nummer}`;
  document.getElementById("examQuestionText").textContent = q.frage;

  const flagBtn = document.getElementById("flagExamQuestionBtn");
  flagBtn.textContent = flagged.has(currentIdx) ? "★ Markierung entfernen" : "☆ Markieren";

  const submitBtn = document.getElementById("submitExamBtn");
  const allAnswered = answeredCount === items.length;
  submitBtn.classList.toggle("btn-success", allAnswered);
  submitBtn.classList.toggle("btn-danger", !allAnswered);

  document.getElementById("examPrevBtn").disabled = currentIdx === 0;
  document.getElementById("examNextBtn").disabled = false;

  const optContainer = document.getElementById("examOptionsList");
  optContainer.innerHTML = "";
  Object.entries(q.antwortmoeglichkeiten).forEach(([key, text]) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    if (answers[currentIdx] === key) btn.classList.add("selected");
    btn.innerHTML = `<span class="option-key">${optionNum(key)}</span><span>${text}</span>`;
    btn.addEventListener("click", () => {
      state.exam.answers[currentIdx] = key;
      renderExamQuestion();
      renderExamNavigator();
      if (
        !state.exam.promptedAllAnswered &&
        Object.keys(state.exam.answers).length === state.exam.items.length
      ) {
        state.exam.promptedAllAnswered = true;
        setTimeout(() => {
          if (confirm("Alle 60 Fragen sind beantwortet! Möchtest du die Klausur jetzt abgeben?")) {
            finishExam(false);
          }
        }, 50);
      }
    });
    optContainer.appendChild(btn);
  });
}

function renderExamNavigator() {
  const grid = document.getElementById("examNavGrid");
  grid.innerHTML = "";

  state.categories.forEach((cat, catIdx) => {
    const wrapper = document.createElement("div");
    const label = document.createElement("div");
    label.className = "nav-cat-label";
    label.textContent = cat;
    wrapper.appendChild(label);

    const cells = document.createElement("div");
    cells.className = "nav-cat-cells";

    const start = catIdx * EXAM_QUESTIONS_PER_CAT;
    for (let i = start; i < start + EXAM_QUESTIONS_PER_CAT; i++) {
      const cell = document.createElement("button");
      cell.className = "nav-cell";
      cell.textContent = String(i + 1);
      if (state.exam.answers[i] !== undefined) cell.classList.add("answered");
      if (state.exam.flagged.has(i)) cell.classList.add("flagged");
      if (i === state.exam.currentIdx) cell.classList.add("current");

      cell.addEventListener("click", () => {
        state.exam.currentIdx = i;
        renderExamQuestion();
        renderExamNavigator();
      });
      cells.appendChild(cell);
    }

    wrapper.appendChild(cells);
    grid.appendChild(wrapper);
  });
}

function finishExam(autoSubmitted = false) {
  if (!state.exam.active) return;
  if (!autoSubmitted) {
    const unanswered = state.exam.items.length - Object.keys(state.exam.answers).length;
    if (unanswered > 0 && !confirm(`Es sind noch ${unanswered} Fragen unbeantwortet. Klausur jetzt abgeben?`)) {
      return;
    }
  }

  clearInterval(state.exam.timerId);
  state.exam.active = false;

  const elapsedSeconds = EXAM_DURATION_SECONDS - Math.max(0, state.exam.remainingSeconds);
  const perCategory = {};
  state.categories.forEach((cat) => {
    perCategory[cat] = { correct: 0, total: EXAM_QUESTIONS_PER_CAT };
  });

  let totalCorrect = 0;
  state.exam.items.forEach((q, idx) => {
    const userAns = state.exam.answers[idx];
    const uid = questionUid(q);
    if (userAns === q.richtige_antwort) {
      totalCorrect += 1;
      perCategory[q.kategorie].correct += 1;
      state.progress.questionStatus[uid] = "correct";
    } else if (userAns !== undefined) {
      state.progress.questionStatus[uid] = "wrong";
    }
  });

  const failedCategories = state.categories.filter(
    (cat) => perCategory[cat].correct < EXAM_MIN_PER_CAT
  );
  const passed = totalCorrect >= EXAM_MIN_TOTAL && failedCategories.length === 0;

  state.exam.results = {
    totalCorrect,
    perCategory,
    failedCategories,
    passed,
    elapsedSeconds,
    autoSubmitted,
  };

  state.progress.examHistory.unshift({
    date: new Date().toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" }),
    totalCorrect,
    passed,
    elapsedSeconds,
    autoSubmitted,
    perCategory,
    failedCategories,
    items: state.exam.items.map((q, idx) => ({
      k: q.kategorie,
      n: q.nummer,
      u: state.exam.answers[idx] ?? null,
    })),
  });
  saveProgress();
  renderExamHistory();
  renderExamResults();
}

function renderExamResults() {
  document.getElementById("examActiveScreen").classList.add("hidden");
  document.getElementById("examResultsScreen").classList.remove("hidden");

  const { totalCorrect, perCategory, failedCategories, passed, elapsedSeconds, autoSubmitted } =
    state.exam.results;
  const pct = Math.round((totalCorrect / 60) * 100);

  let reason = "";
  if (passed) {
    reason = `Glückwunsch! Du hast ${totalCorrect} von 60 Fragen richtig (mind. 45 erforderlich) und in allen 5 Sachgebieten mindestens 9 von 12 Punkten erreicht.`;
  } else {
    const reasons = [];
    if (totalCorrect < EXAM_MIN_TOTAL) {
      reasons.push(`Gesamtpunktzahl ${totalCorrect}/60 (mind. 45 erforderlich)`);
    }
    if (failedCategories.length > 0) {
      reasons.push(`unter 9/12 in: ${failedCategories.join(", ")}`);
    }
    reason = `Nicht bestanden (${reasons.join(" · ")}).`;
  }

  const banner = document.getElementById("resultBanner");
  banner.className = `card result-banner ${passed ? "pass" : "fail"}`;
  banner.innerHTML = `
    <span class="badge ${passed ? "badge-success" : "badge-danger"}">
      ${passed ? "PRÜFUNG BESTANDEN" : "NICHT BESTANDEN"}
    </span>
    <h1>${totalCorrect} / 60 Fragen richtig (${pct} %)</h1>
    <p>${reason}</p>
    <p class="muted small">
      Benötigte Zeit: ${formatTime(elapsedSeconds)} von 120:00
      ${autoSubmitted ? " · (Zeit abgelaufen – automatisch abgegeben)" : ""}
    </p>
  `;

  const catGrid = document.getElementById("categoryResultsGrid");
  catGrid.innerHTML = state.categories
    .map((cat) => {
      const { correct, total } = perCategory[cat];
      const catPass = correct >= EXAM_MIN_PER_CAT;
      const catPct = Math.round((correct / total) * 100);
      return `
        <div class="cat-result-card ${catPass ? "pass" : "fail"}">
          <div class="review-item-head">
            <strong>${cat}</strong>
            <span class="badge ${catPass ? "badge-success" : "badge-danger"}">
              ${catPass ? "Bestanden" : "Unter 9"}
            </span>
          </div>
          <div class="progress-track">
            <div class="progress-fill ${catPass ? "" : "fail"}" style="width: ${catPct}%"></div>
          </div>
          <div class="muted small">${correct} von ${total} richtig (mind. 9 erforderlich)</div>
        </div>
      `;
    })
    .join("");

  document.querySelectorAll("[data-review-filter]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.reviewFilter === state.exam.reviewFilter);
  });
  document.getElementById("reviewCategoryFilter").value = state.exam.reviewCat;

  renderExamReviewList();
}

function renderExamReviewList() {
  const list = document.getElementById("examReviewList");
  const { items, answers, reviewFilter, reviewCat } = state.exam;

  const filtered = items
    .map((q, idx) => ({ q, idx, userAns: answers[idx] }))
    .filter(({ q, userAns }) => {
      if (reviewCat !== "all" && q.kategorie !== reviewCat) return false;
      if (reviewFilter === "correct" && userAns !== q.richtige_antwort) return false;
      if (reviewFilter === "wrong" && userAns === q.richtige_antwort) return false;
      return true;
    });

  if (filtered.length === 0) {
    list.innerHTML = `<p class="muted">Keine Fragen in dieser Filteransicht.</p>`;
    return;
  }

  list.innerHTML = filtered
    .map(({ q, idx, userAns }) => {
      const isOk = userAns === q.richtige_antwort;
      const userText = userAns ? `${optionNum(userAns)}) ${q.antwortmoeglichkeiten[userAns]}` : "Keine Antwort";
      const rightText = `${optionNum(q.richtige_antwort)}) ${q.richtige_antwort_text}`;
      return `
        <div class="review-item ${isOk ? "ok" : "err"}">
          <div class="review-item-head">
            <span class="badge badge-info">Frage ${idx + 1} · ${q.kategorie}</span>
            <span class="badge ${isOk ? "badge-success" : "badge-danger"}">
              ${isOk ? "Richtig" : "Falsch"}
            </span>
          </div>
          <div><strong>${q.nummer}. ${q.frage}</strong></div>
          <div class="review-answers">
            <div>Deine Antwort: <span class="${isOk ? "" : "muted"}">${userText}</span></div>
            ${!isOk ? `<div>Richtige Antwort: <strong>${rightText}</strong></div>` : ""}
            ${!isOk && q.erklaerung ? `<div class="explanation-text"><strong>Erklärung:</strong> ${q.erklaerung}</div>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

function initExamControls() {
  document.getElementById("startExamBtn").addEventListener("click", startExam);
  document.getElementById("restartExamBtn").addEventListener("click", startExam);
  document.getElementById("backToStartFromResultsBtn").addEventListener("click", () => {
    document.getElementById("examResultsScreen").classList.add("hidden");
    document.getElementById("examStartScreen").classList.remove("hidden");
    document.getElementById("catalogSearchSection").classList.remove("hidden");
    renderCatalogResults();
  });
  document.getElementById("submitExamBtn").addEventListener("click", () => finishExam(false));

  document.getElementById("examPrevBtn").addEventListener("click", () => {
    if (state.exam.currentIdx > 0) {
      state.exam.currentIdx -= 1;
      renderExamQuestion();
      renderExamNavigator();
    }
  });

  document.getElementById("examNextBtn").addEventListener("click", () => {
    const total = state.exam.items.length;
    if (total === 0) return;
    const cur = state.exam.currentIdx;

    // 1. Next unanswered question (wrapping around)
    for (let offset = 1; offset < total; offset++) {
      const idx = (cur + offset) % total;
      if (state.exam.answers[idx] === undefined) {
        state.exam.currentIdx = idx;
        renderExamQuestion();
        renderExamNavigator();
        return;
      }
    }

    // 2. If no other unanswered questions exist, next flagged question (wrapping around)
    for (let offset = 1; offset < total; offset++) {
      const idx = (cur + offset) % total;
      if (state.exam.flagged.has(idx)) {
        state.exam.currentIdx = idx;
        renderExamQuestion();
        renderExamNavigator();
        return;
      }
    }

    // 3. Fallback: simple wrap-around to next question
    state.exam.currentIdx = (cur + 1) % total;
    renderExamQuestion();
    renderExamNavigator();
  });

  document.getElementById("flagExamQuestionBtn").addEventListener("click", () => {
    const idx = state.exam.currentIdx;
    if (state.exam.flagged.has(idx)) state.exam.flagged.delete(idx);
    else state.exam.flagged.add(idx);
    renderExamQuestion();
    renderExamNavigator();
  });

  document.querySelectorAll("[data-review-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-review-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      state.exam.reviewFilter = btn.dataset.reviewFilter;
      renderExamReviewList();
    });
  });

  document.getElementById("reviewCategoryFilter").addEventListener("change", (e) => {
    state.exam.reviewCat = e.target.value;
    renderExamReviewList();
  });
}

/* ---------------- Searchable Question Catalog (Virtual List) ---------------- */
let selectedCatalogQuestion = null;
let catalogAnsweredKey = null;
let catalogMatches = [];
let catalogRowHeights = [];
let catalogOffsets = [0];
let catalogVirtualSpacer = null;
let catalogScrollRaf = null;
const CATALOG_ROW_GAP = 8;
const CATALOG_OVERSCAN = 6;

function recomputeCatalogOffsets() {
  catalogOffsets = new Array(catalogMatches.length + 1);
  catalogOffsets[0] = 0;
  for (let i = 0; i < catalogMatches.length; i++) {
    catalogOffsets[i + 1] = catalogOffsets[i] + catalogRowHeights[i] + CATALOG_ROW_GAP;
  }
}

function renderCatalogVirtualWindow() {
  const listEl = document.getElementById("catalogResultsList");
  if (!catalogVirtualSpacer || catalogMatches.length === 0) return;

  const scrollTop = listEl.scrollTop;
  const viewHeight = listEl.clientHeight || 440;
  const total = catalogMatches.length;

  let startIdx = 0;
  while (startIdx < total && catalogOffsets[startIdx + 1] < scrollTop) {
    startIdx++;
  }
  let endIdx = startIdx;
  while (endIdx < total && catalogOffsets[endIdx] <= scrollTop + viewHeight) {
    endIdx++;
  }

  startIdx = Math.max(0, startIdx - CATALOG_OVERSCAN);
  endIdx = Math.min(total - 1, endIdx + CATALOG_OVERSCAN);

  catalogVirtualSpacer.innerHTML = "";
  const rendered = [];

  for (let i = startIdx; i <= endIdx; i++) {
    const q = catalogMatches[i];
    const btn = document.createElement("button");
    btn.className = "catalog-result-item";
    btn.style.top = `${catalogOffsets[i]}px`;
    if (
      selectedCatalogQuestion &&
      selectedCatalogQuestion.kategorie === q.kategorie &&
      selectedCatalogQuestion.nummer === q.nummer
    ) {
      btn.classList.add("active");
    }
    const status = state.progress.questionStatus[questionUid(q)];
    const statusBadge =
      status === "correct"
        ? `<span class="badge badge-success">Richtig</span>`
        : status === "wrong"
        ? `<span class="badge badge-danger">Falsch</span>`
        : "";
    btn.innerHTML = `
      <span class="catalog-result-title">${q.nummer}. ${q.frage}</span>
      <span class="catalog-result-cat">${statusBadge} ${q.kategorie}</span>
    `;
    btn.addEventListener("click", () => {
      selectedCatalogQuestion = q;
      catalogAnsweredKey = null;
      renderSelectedCatalogQuestion();
      renderCatalogVirtualWindow();
    });
    catalogVirtualSpacer.appendChild(btn);
    rendered.push({ i, btn });
  }

  let heightsChanged = false;
  rendered.forEach(({ i, btn }) => {
    const h = btn.offsetHeight;
    if (h > 0 && Math.abs(h - catalogRowHeights[i]) > 0.5) {
      catalogRowHeights[i] = h;
      heightsChanged = true;
    }
  });

  if (heightsChanged) {
    recomputeCatalogOffsets();
    const totalHeight = Math.max(0, catalogOffsets[total] - CATALOG_ROW_GAP);
    catalogVirtualSpacer.style.height = `${totalHeight}px`;
    rendered.forEach(({ i, btn }) => {
      btn.style.top = `${catalogOffsets[i]}px`;
    });
  }
}

function renderCatalogResults(resetScroll = true) {
  const query = document.getElementById("catalogSearchInput").value.trim().toLowerCase();
  const cat = document.getElementById("catalogCategoryFilter").value;
  const statusFilter = document.getElementById("catalogStatusFilter").value;
  const listEl = document.getElementById("catalogResultsList");
  const countEl = document.getElementById("catalogMatchCount");

  catalogMatches = state.questions.filter((q) => {
    if (cat !== "all" && q.kategorie !== cat) return false;
    const status = state.progress.questionStatus[questionUid(q)] || "unanswered";
    if (statusFilter !== "all" && status !== statusFilter) return false;
    if (!query) return true;
    const inNum = String(q.nummer) === query || `#${q.nummer}` === query;
    const inQuestion = q.frage.toLowerCase().includes(query);
    const inOptions = Object.values(q.antwortmoeglichkeiten).some((t) =>
      t.toLowerCase().includes(query)
    );
    return inNum || inQuestion || inOptions;
  });

  countEl.textContent = `${catalogMatches.length} Treffer`;

  if (catalogMatches.length === 0) {
    catalogVirtualSpacer = null;
    listEl.innerHTML = `<p class="muted">Keine passenden Fragen gefunden.</p>`;
    return;
  }

  const estHeight = window.innerWidth <= 768 ? 78 : 54;
  catalogRowHeights = new Array(catalogMatches.length).fill(estHeight);
  recomputeCatalogOffsets();

  listEl.innerHTML = "";
  catalogVirtualSpacer = document.createElement("div");
  catalogVirtualSpacer.className = "catalog-virtual-spacer";
  const totalHeight = Math.max(0, catalogOffsets[catalogMatches.length] - CATALOG_ROW_GAP);
  catalogVirtualSpacer.style.height = `${totalHeight}px`;
  listEl.appendChild(catalogVirtualSpacer);

  if (resetScroll) listEl.scrollTop = 0;
  renderCatalogVirtualWindow();
}

function renderSelectedCatalogQuestion() {
  const box = document.getElementById("catalogSelectedQuestion");
  const q = selectedCatalogQuestion;
  if (!q) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }

  box.classList.remove("hidden");
  const answered = catalogAnsweredKey !== null;
  const isRevealed = catalogAnsweredKey === "__revealed__";
  const isOk = catalogAnsweredKey === q.richtige_antwort;

  box.innerHTML = `
    <div class="catalog-selected-head">
      <span class="badge badge-accent">${q.kategorie} · Nr. ${q.nummer}</span>
      <div>
        <button class="btn btn-ghost small" id="catalogShowAnswerBtn">Lösung anzeigen</button>
        <button class="btn btn-ghost small" id="catalogCloseBtn">✕ Schließen</button>
      </div>
    </div>
    <div class="question-text">${q.nummer}. ${q.frage}</div>
    <div class="options-list" id="catalogOptionsList"></div>
    <div id="catalogFeedbackSlot"></div>
  `;

  const optContainer = document.getElementById("catalogOptionsList");
  Object.entries(q.antwortmoeglichkeiten).forEach(([key, text]) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.disabled = answered;
    if (answered) {
      if (key === q.richtige_antwort) btn.classList.add("correct");
      else if (key === catalogAnsweredKey) btn.classList.add("wrong");
    }
    btn.innerHTML = `<span class="option-key">${optionNum(key)}</span><span>${text}</span>`;
    btn.addEventListener("click", () => {
      catalogAnsweredKey = key;
      state.progress.questionStatus[questionUid(q)] =
        key === q.richtige_antwort ? "correct" : "wrong";
      saveProgress();
      renderSelectedCatalogQuestion();
      if (document.getElementById("catalogStatusFilter").value === "all") {
        renderCatalogVirtualWindow();
      } else {
        renderCatalogResults(false);
      }
    });
    optContainer.appendChild(btn);
  });

  if (answered) {
    document.getElementById("catalogFeedbackSlot").innerHTML = `
      <div class="quiz-feedback ${isOk ? "ok" : isRevealed ? "ok" : "err"}">
        <div>
          ${
            isOk
              ? "Richtig!"
              : isRevealed
              ? `Richtige Antwort: <strong>${optionNum(q.richtige_antwort)})</strong> ${q.richtige_antwort_text}`
              : `Leider falsch. Richtig ist <strong>${optionNum(q.richtige_antwort)})</strong> ${q.richtige_antwort_text}`
          }
        </div>
        ${
          !isOk && q.erklaerung
            ? `<div class="explanation-text"><strong>Erklärung:</strong> ${q.erklaerung}</div>`
            : ""
        }
      </div>
    `;
  }

  document.getElementById("catalogShowAnswerBtn").addEventListener("click", () => {
    catalogAnsweredKey = "__revealed__";
    renderSelectedCatalogQuestion();
  });

  document.getElementById("catalogCloseBtn").addEventListener("click", () => {
    selectedCatalogQuestion = null;
    catalogAnsweredKey = null;
    renderSelectedCatalogQuestion();
    renderCatalogResults(false);
  });
}

function initCatalogSearch() {
  document.getElementById("catalogSearchInput").addEventListener("input", () => renderCatalogResults(true));
  document.getElementById("catalogCategoryFilter").addEventListener("change", () => renderCatalogResults(true));
  document.getElementById("catalogStatusFilter").addEventListener("change", () => renderCatalogResults(true));
  document.getElementById("catalogResultsList").addEventListener("scroll", () => {
    if (catalogScrollRaf) return;
    catalogScrollRaf = requestAnimationFrame(() => {
      catalogScrollRaf = null;
      renderCatalogVirtualWindow();
    });
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (!catalogVirtualSpacer || catalogMatches.length === 0) return;
      const estHeight = window.innerWidth <= 768 ? 78 : 54;
      catalogRowHeights = new Array(catalogMatches.length).fill(estHeight);
      recomputeCatalogOffsets();
      const totalHeight = Math.max(0, catalogOffsets[catalogMatches.length] - CATALOG_ROW_GAP);
      catalogVirtualSpacer.style.height = `${totalHeight}px`;
      renderCatalogVirtualWindow();
    }, 100);
  });
}

function getSelectedRandomCategories() {
  return [...document.querySelectorAll('#randomCategoryCheckboxes input[type="checkbox"]:checked')].map(
    (cb) => cb.value
  );
}

function updateRandomPromptCounts() {
  const selectedCats = new Set(getSelectedRandomCategories());
  const catPool = state.questions.filter((q) => selectedCats.has(q.kategorie));
  const unansweredCount = catPool.filter(
    (q) => !state.progress.questionStatus[questionUid(q)]
  ).length;
  const wrongCount = catPool.filter(
    (q) => state.progress.questionStatus[questionUid(q)] === "wrong"
  ).length;

  document.getElementById("randomModeUnanswered").textContent =
    `Nur offene Fragen (${unansweredCount})`;
  document.getElementById("randomModeWrong").textContent =
    `Nur falsch beantwortete (${wrongCount})`;
  document.getElementById("randomModeAll").textContent =
    `Alle Fragen (${catPool.length})`;

  const msgEl = document.getElementById("randomPromptMsg");
  if (msgEl && selectedCats.size > 0) {
    msgEl.textContent = "Wähle den gewünschten Fragen-Pool aus:";
    msgEl.style.color = "";
  }
}

function renderRandomCategoryCheckboxes() {
  const container = document.getElementById("randomCategoryCheckboxes");
  container.innerHTML = "";
  state.categories.forEach((cat) => {
    const label = document.createElement("label");
    label.className = "random-cat-chip";
    label.innerHTML = `<input type="checkbox" value="${cat}" checked /><span>${cat}</span>`;
    label.querySelector("input").addEventListener("change", updateRandomPromptCounts);
    container.appendChild(label);
  });
}

function initRandomPractice() {
  const startBtn = document.getElementById("startRandomBtn");
  const promptBox = document.getElementById("randomPromptBox");
  const msgEl = document.getElementById("randomPromptMsg");

  startBtn.addEventListener("click", () => {
    updateRandomPromptCounts();
    msgEl.textContent = "Wähle den gewünschten Fragen-Pool aus:";
    msgEl.style.color = "";
    promptBox.classList.remove("hidden");
  });

  document.getElementById("randomPromptCancel").addEventListener("click", () => {
    promptBox.classList.add("hidden");
  });

  document.querySelectorAll("[data-random-mode]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const selectedCats = new Set(getSelectedRandomCategories());
      if (selectedCats.size === 0) {
        msgEl.textContent = "Bitte wähle mindestens ein Sachgebiet aus.";
        msgEl.style.color = "var(--warning)";
        return;
      }

      const mode = btn.dataset.randomMode;
      let pool = state.questions.filter((q) => selectedCats.has(q.kategorie));
      if (mode === "unanswered") {
        pool = pool.filter((q) => !state.progress.questionStatus[questionUid(q)]);
      } else if (mode === "wrong") {
        pool = pool.filter(
          (q) => state.progress.questionStatus[questionUid(q)] === "wrong"
        );
      }

      if (pool.length === 0) {
        msgEl.textContent =
          mode === "wrong"
            ? "Du hast aktuell keine falsch beantworteten Fragen."
            : "Du hast bereits alle Fragen beantwortet.";
        msgEl.style.color = "var(--warning)";
        return;
      }

      promptBox.classList.add("hidden");
      state.random = {
        items: shuffle(pool),
        pos: 0,
        score: 0,
        answered: false,
        selectedKey: null,
      };
      document.getElementById("examStartScreen").classList.add("hidden");
      document.getElementById("catalogSearchSection").classList.add("hidden");
      document.getElementById("randomPracticeScreen").classList.remove("hidden");
      renderRandomQuestion();
    });
  });

  document.getElementById("exitRandomBtn").addEventListener("click", () => {
    document.getElementById("randomPracticeScreen").classList.add("hidden");
    document.getElementById("examStartScreen").classList.remove("hidden");
    document.getElementById("catalogSearchSection").classList.remove("hidden");
    renderCatalogResults();
  });

  document.getElementById("randomNextBtn").addEventListener("click", () => {
    state.random.pos += 1;
    state.random.answered = false;
    state.random.selectedKey = null;
    renderRandomQuestion();
  });
}

function renderRandomQuestion() {
  const { items, pos, score, answered, selectedKey } = state.random;
  const nextBtn = document.getElementById("randomNextBtn");
  const feedbackSlot = document.getElementById("randomFeedbackSlot");
  const optContainer = document.getElementById("randomOptionsList");

  if (pos >= items.length) {
    const pct = Math.round((score / items.length) * 100);
    document.getElementById("randomCategoryBadge").textContent = "Abgeschlossen";
    document.getElementById("randomProgressText").textContent = `${items.length} / ${items.length}`;
    document.getElementById("randomQuestionText").textContent =
      `Runde beendet: ${score} von ${items.length} Fragen richtig (${pct} %).`;
    document.getElementById("randomCatalogNum").textContent = "";
    optContainer.innerHTML = "";
    feedbackSlot.innerHTML = "";
    nextBtn.classList.add("hidden");
    return;
  }

  const q = items[pos];
  document.getElementById("randomCategoryBadge").textContent = q.kategorie;
  document.getElementById("randomProgressText").textContent =
    `Frage ${pos + 1} / ${items.length} · Richtig: ${score}`;
  document.getElementById("randomQuestionText").textContent = `${q.nummer}. ${q.frage}`;
  document.getElementById("randomCatalogNum").textContent = `Katalog-Nr. ${q.nummer}`;

  optContainer.innerHTML = "";
  Object.entries(q.antwortmoeglichkeiten).forEach(([key, text]) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.disabled = answered;
    if (answered) {
      if (key === q.richtige_antwort) btn.classList.add("correct");
      else if (key === selectedKey) btn.classList.add("wrong");
    }
    btn.innerHTML = `<span class="option-key">${optionNum(key)}</span><span>${text}</span>`;
    btn.addEventListener("click", () => {
      if (state.random.answered) return;
      state.random.answered = true;
      state.random.selectedKey = key;
      const isOk = key === q.richtige_antwort;
      if (isOk) state.random.score += 1;
      state.progress.questionStatus[questionUid(q)] = isOk ? "correct" : "wrong";
      saveProgress();
      renderRandomQuestion();
    });
    optContainer.appendChild(btn);
  });

  if (answered) {
    const isOk = selectedKey === q.richtige_antwort;
    feedbackSlot.innerHTML = `
      <div class="quiz-feedback ${isOk ? "ok" : "err"}">
        <div>
          ${
            isOk
              ? "Richtig!"
              : `Leider falsch. Richtig ist <strong>${optionNum(q.richtige_antwort)})</strong> ${q.richtige_antwort_text}`
          }
        </div>
        ${
          !isOk && q.erklaerung
            ? `<div class="explanation-text"><strong>Erklärung:</strong> ${q.erklaerung}</div>`
            : ""
        }
      </div>
    `;
    nextBtn.textContent = pos + 1 === items.length ? "Ergebnis anzeigen" : "Nächste Frage →";
    nextBtn.classList.remove("hidden");
  } else {
    feedbackSlot.innerHTML = "";
    nextBtn.classList.add("hidden");
  }
}

function toBase64Url(bytes) {
  let bin = "";
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(str) {
  const padded = str.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((str.length + 3) % 4);
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function encodeSyncUrl() {
  const byteLen = Math.ceil((state.questions.length * 2) / 8);
  const packed = new Uint8Array(byteLen);
  state.questions.forEach((q, idx) => {
    const status = state.progress.questionStatus[questionUid(q)];
    const code = status === "correct" ? 1 : status === "wrong" ? 2 : 0;
    const bitPos = idx * 2;
    packed[bitPos >> 3] |= code << (bitPos & 7);
  });

  const compactExams = state.progress.examHistory.slice(0, 5).map((h) => [
    h.date,
    h.totalCorrect,
    h.passed ? 1 : 0,
    h.elapsedSeconds,
    state.categories.map((cat) => h.perCategory?.[cat]?.correct ?? 0),
  ]);

  const jsonBytes = new TextEncoder().encode(
    JSON.stringify({ v: 1, q: toBase64Url(packed), e: compactExams })
  );
  const token = toBase64Url(jsonBytes);
  return `${window.location.origin}${window.location.pathname}#sync=${token}`;
}

function decodeSyncToken(token) {
  try {
    const jsonBytes = fromBase64Url(token);
    const payload = JSON.parse(new TextDecoder().decode(jsonBytes));
    if (!payload || payload.v !== 1 || !payload.q) return null;

    const packed = fromBase64Url(payload.q);
    const questionStatus = {};
    state.questions.forEach((q, idx) => {
      const bitPos = idx * 2;
      const code = (packed[bitPos >> 3] >> (bitPos & 7)) & 3;
      if (code === 1) questionStatus[questionUid(q)] = "correct";
      else if (code === 2) questionStatus[questionUid(q)] = "wrong";
    });

    const examHistory = (payload.e || []).map((row) => {
      const perCategory = {};
      const failedCategories = [];
      state.categories.forEach((cat, catIdx) => {
        const correct = row[4]?.[catIdx] ?? 0;
        perCategory[cat] = { correct, total: EXAM_QUESTIONS_PER_CAT };
        if (correct < EXAM_MIN_PER_CAT) failedCategories.push(cat);
      });
      return {
        date: row[0],
        totalCorrect: row[1],
        passed: Boolean(row[2]),
        elapsedSeconds: row[3],
        perCategory,
        failedCategories,
      };
    });

    return { questionStatus, examHistory };
  } catch {
    return null;
  }
}

function initShareAndSync() {
  const modal = document.getElementById("shareModal");
  const qrContainer = document.getElementById("qrCodeContainer");
  const urlInput = document.getElementById("syncUrlInput");
  const copyFeedback = document.getElementById("copySyncFeedback");

  document.getElementById("shareProgressBtn").addEventListener("click", () => {
    const syncUrl = encodeSyncUrl();
    urlInput.value = syncUrl;
    copyFeedback.textContent = "";

    const qr = qrcode(0, "M");
    qr.addData(syncUrl);
    qr.make();
    qrContainer.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 4 });
    modal.classList.remove("hidden");
  });

  document.getElementById("closeShareModalBtn").addEventListener("click", () => {
    modal.classList.add("hidden");
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.add("hidden");
  });

  document.getElementById("copySyncUrlBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(urlInput.value);
      copyFeedback.textContent = "Link in die Zwischenablage kopiert!";
    } catch {
      urlInput.select();
      copyFeedback.textContent = "Link markiert – bitte mit Strg+C kopieren.";
    }
  });
}

function checkIncomingSync() {
  const hash = window.location.hash || "";
  if (!hash.startsWith("#sync=")) return;
  const incoming = decodeSyncToken(hash.slice(6));
  if (!incoming) return;

  const correctCount = Object.values(incoming.questionStatus).filter((v) => v === "correct").length;
  const wrongCount = Object.values(incoming.questionStatus).filter((v) => v === "wrong").length;
  const examCount = incoming.examHistory.length;

  const banner = document.getElementById("syncImportBanner");
  document.getElementById("syncImportSummary").textContent =
    `Richtig: ${correctCount} · Falsch: ${wrongCount} · Klausuren: ${examCount}. Möchtest du diesen Stand übernehmen?`;
  banner.classList.remove("hidden");

  const finishSync = () => {
    banner.classList.add("hidden");
    history.replaceState(null, "", window.location.pathname + window.location.search);
    saveProgress();
    updateCatalogStat();
    updateRandomPromptCounts();
    renderExamHistory();
    renderSelectedCatalogQuestion();
    renderCatalogResults();
  };

  document.getElementById("syncMergeBtn").addEventListener("click", () => {
    state.progress.questionStatus = {
      ...state.progress.questionStatus,
      ...incoming.questionStatus,
    };
    const seen = new Set(state.progress.examHistory.map((h) => `${h.date}|${h.totalCorrect}|${h.elapsedSeconds}`));
    incoming.examHistory.forEach((h) => {
      const key = `${h.date}|${h.totalCorrect}|${h.elapsedSeconds}`;
      if (!seen.has(key)) state.progress.examHistory.push(h);
    });
    finishSync();
  });

  document.getElementById("syncReplaceBtn").addEventListener("click", () => {
    state.progress.questionStatus = incoming.questionStatus;
    state.progress.examHistory = incoming.examHistory;
    finishSync();
  });

  document.getElementById("syncCancelBtn").addEventListener("click", () => {
    banner.classList.add("hidden");
    history.replaceState(null, "", window.location.pathname + window.location.search);
  });
}

function initKeyboardShortcuts() {
  document.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (!document.getElementById("shareModal").classList.contains("hidden")) return;

    const examVisible = !document.getElementById("examActiveScreen").classList.contains("hidden");
    const randomVisible = !document.getElementById("randomPracticeScreen").classList.contains("hidden");
    const catalogSelectedVisible =
      !document.getElementById("catalogSearchSection").classList.contains("hidden") &&
      !document.getElementById("catalogSelectedQuestion").classList.contains("hidden");

    if (e.key === "1" || e.key === "2" || e.key === "3") {
      const idx = Number(e.key) - 1;
      if (examVisible) {
        document.querySelectorAll("#examOptionsList .option-btn")[idx]?.click();
      } else if (randomVisible) {
        document.querySelectorAll("#randomOptionsList .option-btn")[idx]?.click();
      } else if (catalogSelectedVisible) {
        document.querySelectorAll("#catalogOptionsList .option-btn")[idx]?.click();
      }
      return;
    }

    if (e.key === "4" && examVisible) {
      document.getElementById("flagExamQuestionBtn")?.click();
      return;
    }

    if (e.key === "Enter") {
      if (examVisible) {
        const nextBtn = document.getElementById("examNextBtn");
        if (nextBtn && !nextBtn.disabled) {
          e.preventDefault();
          nextBtn.click();
        }
      } else if (randomVisible) {
        const nextBtn = document.getElementById("randomNextBtn");
        if (nextBtn && !nextBtn.classList.contains("hidden")) {
          e.preventDefault();
          nextBtn.click();
        }
      }
    }
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const btn = document.getElementById("themeToggleBtn");
  if (btn) {
    btn.textContent = theme === "light" ? "🌙 Dunkel" : "☀️ Hell";
  }
}

function initTheme() {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  const initial = saved || (prefersLight ? "light" : "dark");
  applyTheme(initial);

  document.getElementById("themeToggleBtn").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme") || "dark";
    const next = current === "light" ? "dark" : "light";
    localStorage.setItem(THEME_STORAGE_KEY, next);
    applyTheme(next);
  });
}

async function fetchQuestions() {
  try {
    const res = await fetch("/api/questions");
    if (res.ok) return await res.json();
  } catch {
    // Fall back to static JSON when running on GitHub Pages
  }
  const fallbackRes = await fetch("./data/hessen_pruefungsfragen.json");
  return await fallbackRes.json();
}

async function init() {
  initTheme();
  initExamControls();
  initRandomPractice();
  initCatalogSearch();
  initShareAndSync();
  initKeyboardShortcuts();
  document.getElementById("resetProgressBtn").addEventListener("click", () => {
    if (!confirm("Gespeicherten Lernstand (richtige/falsche Fragen & Klausuren) wirklich zurücksetzen?")) {
      return;
    }
    state.progress = { examHistory: [], questionStatus: {} };
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LEGACY_STORAGE_KEY);
    updateCatalogStat();
    updateRandomPromptCounts();
    renderExamHistory();
    renderSelectedCatalogQuestion();
    renderCatalogResults();
  });
  state.questions = await fetchQuestions();
  state.categories = [...new Set(state.questions.map((q) => q.kategorie))];
  updateCatalogStat();
  populateReviewCategories();
  renderRandomCategoryCheckboxes();
  renderExamHistory();
  renderCatalogResults();
  checkIncomingSync();
  window.addEventListener("hashchange", checkIncomingSync);
}

init();
