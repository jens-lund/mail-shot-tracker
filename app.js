const CONFIG = window.MAIL_TRACKER_CONFIG || {};
const STAGES = [
  { id: "done", label: "Done" },
  { id: "environment", label: "Enviroment" },
  { id: "characters", label: "Characters" },
  { id: "assets", label: "Assets" },
  { id: "animation", label: "Animasjon" },
  { id: "lighting", label: "Lys" },
  { id: "camera", label: "Kamera" },
  { id: "render", label: "Render" },
  { id: "compositing", label: "Compositing" }
];

const ASSIGNEES = [
  { id: "jens", label: "Jens", rowLabel: "Jens" },
  { id: "nicolai", label: "Nicolai", rowLabel: "Nico" },
  { id: "kevin", label: "Kevin", rowLabel: "Kevin" }
];

const DEFAULT_SHOT_IDS = [
  "scene_01_shot_01",
  "scene_01_shot_02",
  "scene_01_shot_03",
  "scene_01_shot_04",
  "scene_01_shot_05",
  "scene_01_shot_06",
  "scene_01_shot_07",
  "scene_01_shot_08",
  "scene_01_shot_09",
  "scene_02_shot_01",
  "scene_02_shot_02",
  "scene_02_shot_03",
  "scene_02_shot_04",
  "scene_02_shot_05",
  "scene_02_shot_07",
  "scene_02_shot_08",
  "scene_02_shot_09",
  "scene_02_shot_10",
  "scene_02_shot_11",
  "scene_02_shot_12",
  "scene_02_shot_13",
  "scene_03_shot_01",
  "scene_03_shot_02",
  "scene_03_shot_03",
  "scene_04_shot_01",
  "scene_04_shot_02",
  "scene_04_shot_03",
  "scene_04_shot_04",
  "scene_04_shot_05",
  "scene_04_shot_06",
  "scene_04_shot_07"
];

const STORAGE_KEYS = {
  draft: "mail-tracker-draft-v1",
  token: "mail-tracker-github-token",
  settings: "mail-tracker-github-settings",
  unlocked: "mail-tracker-unlocked"
};

const state = {
  data: null,
  filter: "all",
  assigneeFilter: "all",
  search: "",
  sort: "chronological",
  unlocked: false,
  remoteSha: "",
  saveTimer: null,
  isSaving: false,
  settings: buildInitialSettings()
};

const els = {
  totalProgress: document.getElementById("totalProgress"),
  totalProgressBar: document.getElementById("totalProgressBar"),
  shotCount: document.getElementById("shotCount"),
  doneCount: document.getElementById("doneCount"),
  activeCount: document.getElementById("activeCount"),
  attentionCount: document.getElementById("attentionCount"),
  shotGrid: document.getElementById("shotGrid"),
  syncStatus: document.getElementById("syncStatus"),
  assignmentBoard: document.getElementById("assignmentBoard"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  assigneeFilter: document.getElementById("assigneeFilter"),
  filterButtons: document.getElementById("filterButtons"),
  unlockButton: document.getElementById("unlockButton"),
  refreshButton: document.getElementById("refreshButton"),
  settingsButton: document.getElementById("settingsButton"),
  unlockDialog: document.getElementById("unlockDialog"),
  unlockForm: document.getElementById("unlockForm"),
  passwordInput: document.getElementById("passwordInput"),
  settingsDialog: document.getElementById("settingsDialog"),
  settingsForm: document.getElementById("settingsForm"),
  ownerInput: document.getElementById("ownerInput"),
  repoInput: document.getElementById("repoInput"),
  branchInput: document.getElementById("branchInput"),
  dataPathInput: document.getElementById("dataPathInput"),
  tokenInput: document.getElementById("tokenInput"),
  clearTokenButton: document.getElementById("clearTokenButton"),
  previewToggle: document.getElementById("previewToggle"),
  previewCollapseButton: document.getElementById("previewCollapseButton"),
  previsVideo: document.getElementById("previsVideo"),
  videoFrame: document.querySelector(".video-frame"),
  videoOverlayButton: document.getElementById("videoOverlayButton"),
  videoPlayButton: document.getElementById("videoPlayButton"),
  videoTimeline: document.getElementById("videoTimeline"),
  videoCurrentTime: document.getElementById("videoCurrentTime"),
  videoDuration: document.getElementById("videoDuration")
};

init();

async function init() {
  setLockedClass();
  wireEvents();
  await loadData();
  render();
  showPasswordGate();
  refreshIcons();
}

function buildInitialSettings() {
  const saved = readJson(localStorage.getItem(STORAGE_KEYS.settings)) || {};
  const inferred = inferGitHubRepoFromUrl();
  return {
    owner: saved.owner || CONFIG.github?.owner || inferred.owner || "",
    repo: saved.repo || CONFIG.github?.repo || inferred.repo || "",
    branch: saved.branch || CONFIG.github?.branch || "main",
    dataPath: saved.dataPath || CONFIG.github?.dataPath || "data/shots.json"
  };
}

function inferGitHubRepoFromUrl() {
  const host = window.location.hostname;
  if (!host.endsWith(".github.io")) return {};
  const owner = host.replace(".github.io", "");
  const repo = window.location.pathname.split("/").filter(Boolean)[0] || "";
  return { owner, repo };
}

function wireEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value.trim().toLowerCase();
    renderShots();
  });

  els.sortSelect.addEventListener("change", (event) => {
    state.sort = event.target.value;
    renderShots();
  });

  els.assigneeFilter.addEventListener("change", (event) => {
    state.assigneeFilter = event.target.value;
    renderShots();
  });

  els.filterButtons.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-filter]");
    if (!button) return;
    state.filter = button.dataset.filter;
    [...els.filterButtons.querySelectorAll("button")].forEach((item) => {
      item.classList.toggle("active", item === button);
    });
    renderShots();
  });

  els.unlockButton.addEventListener("click", () => {
    if (state.unlocked) {
      lockEditing();
      return;
    }
    els.passwordInput.value = "";
    els.unlockDialog.showModal();
    setTimeout(() => els.passwordInput.focus(), 40);
  });

  els.unlockDialog.addEventListener("cancel", (event) => {
    if (!state.unlocked) {
      event.preventDefault();
    }
  });

  els.unlockDialog.addEventListener("close", () => {
    if (!state.unlocked) {
      showPasswordGate();
    }
  });

  els.unlockForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const ok = await verifyPassword(els.passwordInput.value);
    if (!ok) {
      setSyncStatus("Feil passord.", "bad");
      els.passwordInput.select();
      return;
    }
    state.unlocked = true;
    els.unlockDialog.close();
    setLockedClass();
    render();
    setSyncStatus("Redigering er låst opp på denne maskinen.", "good");
  });

  els.settingsButton.addEventListener("click", () => {
    els.ownerInput.value = state.settings.owner;
    els.repoInput.value = state.settings.repo;
    els.branchInput.value = state.settings.branch;
    els.dataPathInput.value = state.settings.dataPath;
    els.tokenInput.value = localStorage.getItem(STORAGE_KEYS.token) || "";
    els.settingsDialog.showModal();
  });

  els.settingsForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.settings = {
      owner: els.ownerInput.value.trim(),
      repo: els.repoInput.value.trim(),
      branch: els.branchInput.value.trim() || "main",
      dataPath: els.dataPathInput.value.trim() || "data/shots.json"
    };
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings));
    if (els.tokenInput.value.trim()) {
      localStorage.setItem(STORAGE_KEYS.token, els.tokenInput.value.trim());
    }
    els.settingsDialog.close();
    setSyncStatus("GitHub-innstillinger er lagret i denne nettleseren.", "good");
  });

  els.clearTokenButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEYS.token);
    els.tokenInput.value = "";
    setSyncStatus("GitHub-token er fjernet fra denne nettleseren.", "good");
  });

  els.refreshButton.addEventListener("click", async () => {
    await loadData({ forceRemote: true });
    render();
  });

  els.previewToggle.addEventListener("click", togglePreview);
  els.previewCollapseButton.addEventListener("click", closePreview);
  els.videoOverlayButton.addEventListener("click", toggleVideoPlayback);
  els.videoPlayButton.addEventListener("click", toggleVideoPlayback);
  els.previsVideo.addEventListener("click", toggleVideoPlayback);
  els.previsVideo.addEventListener("loadedmetadata", updateVideoUi);
  els.previsVideo.addEventListener("timeupdate", updateVideoUi);
  els.previsVideo.addEventListener("play", updateVideoUi);
  els.previsVideo.addEventListener("pause", updateVideoUi);
  els.videoTimeline.addEventListener("input", () => {
    if (!Number.isFinite(els.previsVideo.duration)) return;
    els.previsVideo.currentTime = (Number(els.videoTimeline.value) / 1000) * els.previsVideo.duration;
  });
  updateVideoUi();
}

async function loadData({ forceRemote = false } = {}) {
  setSyncStatus("Henter shot-data...");
  const token = getToken();
  const canTryRemote = state.settings.owner && state.settings.repo;

  if (canTryRemote && (forceRemote || token || window.location.hostname.endsWith(".github.io"))) {
    try {
      const remote = await fetchGitHubData();
      state.data = normalizeData(remote.data);
      state.remoteSha = remote.sha;
      localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(state.data));
      setSyncStatus("Synket med GitHub.", "good");
      return;
    } catch (error) {
      console.warn(error);
      setSyncStatus("Kunne ikke hente fra GitHub. Bruker lokal datafil.", "warn");
    }
  }

  const draft = readJson(localStorage.getItem(STORAGE_KEYS.draft));
  if (draft) {
    state.data = normalizeData(draft);
    setSyncStatus("Lokal kladd er lastet.", "good");
    return;
  }

  try {
    const local = await fetch("data/shots.json", { cache: "no-store" });
    const data = await local.json();
    state.data = normalizeData(data);
    setSyncStatus("Lokal datafil er lastet.", "good");
  } catch (error) {
    console.warn(error);
    state.data = normalizeData(buildDefaultData());
    setSyncStatus("Direkte filvisning bruker innebygd shot-liste.", "warn");
  }
}

function buildDefaultData() {
  return {
    project: CONFIG.projectName || "Mail",
    updatedAt: "",
    stages: STAGES.map((stage) => stage.id),
    shots: DEFAULT_SHOT_IDS.map((id) => ({
      id,
      title: id,
      scene: sceneFromId(id),
      image: `images/${id}.png`,
      onedriveUrl: "",
      assignee: "",
      notes: "",
      updatedAt: "",
      tasks: {}
    }))
  };
}

function normalizeData(data) {
  const normalized = structuredClone(data);
  normalized.stages = STAGES.map((stage) => stage.id);
  normalized.shots = normalized.shots.map((shot, index) => {
    const tasks = {};
    STAGES.forEach((stage) => {
      tasks[stage.id] = Boolean(shot.tasks?.[stage.id]);
    });
    if (tasks.done) {
      STAGES.forEach((stage) => {
        tasks[stage.id] = true;
      });
    }
    return {
      ...shot,
      order: shot.order ?? index + 1,
      scene: shot.scene || sceneFromId(shot.id),
      title: shot.title || shot.id,
      onedriveUrl: shot.onedriveUrl || "",
      assignee: normalizeAssignee(shot.assignee),
      notes: shot.notes || "",
      updatedAt: shot.updatedAt || "",
      tasks
    };
  });
  return normalized;
}

function sceneFromId(id) {
  const match = id.match(/scene_(\d+)/);
  return match ? `Scene ${match[1]}` : "Scene";
}

function render() {
  renderOverview();
  renderAssignmentBoard();
  renderShots();
  setLockedClass();
  refreshIcons();
}

function renderOverview() {
  const shots = state.data.shots;
  const completedTasks = shots.reduce((sum, shot) => {
    return sum + STAGES.filter((stage) => shot.tasks?.[stage.id]).length;
  }, 0);
  const totalRaw = (completedTasks / Math.max(shots.length * STAGES.length, 1)) * 100;
  const total = formatPercent(totalRaw);
  const done = shots.filter((shot) => getProgress(shot) === 100).length;
  const active = shots.filter((shot) => getProgress(shot) > 0 && getProgress(shot) < 100).length;
  const attention = shots.filter(needsAttention).length;

  els.totalProgress.textContent = total;
  els.totalProgressBar.style.width = `${totalRaw}%`;
  els.shotCount.textContent = shots.length;
  els.doneCount.textContent = done;
  els.activeCount.textContent = active;
  els.attentionCount.textContent = attention;
}

function renderAssignmentBoard() {
  const groups = [
    ...ASSIGNEES,
    { id: "unassigned", label: "Ikke markert", rowLabel: "Ikke markert" }
  ];

  els.assignmentBoard.innerHTML = groups.map((group) => {
    const shots = state.data.shots
      .filter((shot) => group.id === "unassigned" ? !shot.assignee : shot.assignee === group.id)
      .sort((a, b) => compareShotIds(a.id, b.id));
    const shotChips = shots.length
      ? shots.map((shot) => `<span class="assignment-chip">${escapeHtml(shot.title)}</span>`).join("")
      : `<span class="assignment-empty">Ingen shots</span>`;

    return `
      <div class="assignment-row" data-assignee="${group.id}">
        <div class="assignment-person">
          <strong>${escapeHtml(group.rowLabel)}</strong>
          <span>${shots.length} ${shots.length === 1 ? "shot" : "shots"}</span>
        </div>
        <div class="assignment-shots">${shotChips}</div>
      </div>
    `;
  }).join("");
}

function formatPercent(value) {
  if (value > 0 && value < 1) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

function renderShots() {
  const shots = getVisibleShots();
  els.shotGrid.innerHTML = shots.map(renderShotCard).join("");
  bindShotControls();
  refreshIcons();
}

function getVisibleShots() {
  const query = state.search;
  return [...state.data.shots]
    .filter((shot) => {
      const progress = getProgress(shot);
      if (state.filter === "not-started" && progress !== 0) return false;
      if (state.filter === "in-progress" && (progress === 0 || progress === 100)) return false;
      if (state.filter === "almost" && (progress < 70 || progress === 100)) return false;
      if (state.filter === "done" && progress !== 100) return false;
      if (state.assigneeFilter === "unassigned" && shot.assignee) return false;
      if (state.assigneeFilter !== "all" && state.assigneeFilter !== "unassigned" && shot.assignee !== state.assigneeFilter) return false;
      if (!query) return true;
      return `${shot.title} ${shot.scene} ${getAssigneeLabel(shot.assignee)} ${shot.notes}`.toLowerCase().includes(query);
    })
    .sort((a, b) => {
      if (state.sort === "low") return getProgress(a) - getProgress(b);
      if (state.sort === "high") return getProgress(b) - getProgress(a);
      if (state.sort === "attention") return Number(needsAttention(b)) - Number(needsAttention(a));
      return compareShotIds(a.id, b.id);
    });
}

function renderShotCard(shot) {
  const progress = getProgress(shot);
  const statusClass = progress >= 75 ? "high" : progress >= 35 ? "mid" : "low";
  const statusText = progress === 100 ? "Done" : progress === 0 ? "Ikke startet" : `${progress}%`;
  const disabled = state.unlocked ? "" : "disabled";
  const folderLink = state.unlocked && shot.onedriveUrl
    ? `<a class="folder-link" href="${escapeAttr(shot.onedriveUrl)}" target="_blank" rel="noopener noreferrer"><i data-lucide="folder-open"></i>Mappe</a>`
    : "";
  const assigneeOptions = [
    `<option value="">Jobbes med av</option>`,
    ...ASSIGNEES.map((person) => (
      `<option value="${person.id}" ${shot.assignee === person.id ? "selected" : ""}>Jobbes med av ${escapeHtml(person.label)}</option>`
    ))
  ].join("");
  const taskHtml = STAGES.map((stage) => `
    <label class="task-toggle">
      <input type="checkbox" data-shot="${shot.id}" data-task="${stage.id}" ${shot.tasks[stage.id] ? "checked" : ""} ${disabled}>
      <span>${stage.label}</span>
    </label>
  `).join("");

  return `
    <article class="shot-card" data-id="${shot.id}">
      <div class="shot-media">
        <img src="${escapeHtml(shot.image)}" alt="${escapeHtml(shot.title)}">
        <span class="status-pill ${statusClass}">${statusText}</span>
      </div>
      <div class="shot-body">
        <div class="shot-card-head">
          <input class="shot-title-input" data-field="title" data-shot="${shot.id}" value="${escapeAttr(shot.title)}" ${disabled}>
          <input class="shot-scene-input" data-field="scene" data-shot="${shot.id}" value="${escapeAttr(shot.scene)}" ${disabled}>
        </div>
        ${folderLink ? `<div class="shot-folder-row">${folderLink}</div>` : ""}
        <div class="assignee-row">
          <select class="assignee-select ${shot.assignee ? "assigned" : "unassigned"}" data-assignee-shot="${shot.id}" ${disabled} aria-label="Jobbes med av">
            ${assigneeOptions}
          </select>
        </div>
        <div class="card-progress-row">
          <div class="card-progress"><span style="width: ${progress}%"></span></div>
          <span class="percent">${progress}%</span>
        </div>
        <div class="task-grid">${taskHtml}</div>
        <textarea class="notes-field" data-field="notes" data-shot="${shot.id}" placeholder="Notater" ${disabled}>${escapeHtml(shot.notes)}</textarea>
      </div>
    </article>
  `;
}

function bindShotControls() {
  els.shotGrid.querySelectorAll("input[type='checkbox']").forEach((input) => {
    input.addEventListener("change", () => {
      const shot = findShot(input.dataset.shot);
      shot.tasks[input.dataset.task] = input.checked;
      if (input.dataset.task === "done" && input.checked) {
        STAGES.forEach((stage) => {
          shot.tasks[stage.id] = true;
        });
      }
      if (input.dataset.task !== "done" && !input.checked) {
        shot.tasks.done = false;
      }
      if (STAGES.filter((stage) => stage.id !== "done").every((stage) => shot.tasks[stage.id])) {
        shot.tasks.done = true;
      }
      markUpdated(shot);
      persistChange();
      render();
    });
  });

  els.shotGrid.querySelectorAll("[data-field]").forEach((field) => {
    field.addEventListener("input", () => {
      const shot = findShot(field.dataset.shot);
      shot[field.dataset.field] = field.value;
      markUpdated(shot);
      persistChange({ rerender: false });
    });
    field.addEventListener("blur", render);
  });

  els.shotGrid.querySelectorAll("[data-assignee-shot]").forEach((select) => {
    select.addEventListener("change", () => {
      const shot = findShot(select.dataset.assigneeShot);
      shot.assignee = normalizeAssignee(select.value);
      markUpdated(shot);
      persistChange();
      render();
    });
  });
}

function findShot(id) {
  return state.data.shots.find((shot) => shot.id === id);
}

function markUpdated(shot) {
  const stamp = new Date().toISOString();
  shot.updatedAt = stamp;
  state.data.updatedAt = stamp;
}

function persistChange({ rerender = true } = {}) {
  localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(state.data));
  if (rerender) renderOverview();
  queueGitHubSave();
}

function queueGitHubSave() {
  clearTimeout(state.saveTimer);
  const token = getToken();
  if (!token || !state.settings.owner || !state.settings.repo) {
    setSyncStatus("Endringen er lagret lokalt. Legg inn GitHub-token for online synk.", "warn");
    return;
  }
  setSyncStatus("Lagrer til GitHub snart...");
  state.saveTimer = setTimeout(saveToGitHub, 1500);
}

async function saveToGitHub() {
  if (state.isSaving) {
    queueGitHubSave();
    return;
  }
  state.isSaving = true;
  setSyncStatus("Lagrer til GitHub...");
  try {
    if (!state.remoteSha) {
      const remote = await fetchGitHubData();
      state.remoteSha = remote.sha;
    }
    const content = JSON.stringify(stripRuntimeFields(state.data), null, 2) + "\n";
    const response = await githubRequest("PUT", contentsUrl(), {
      message: `Update Mail shot tracker ${new Date().toISOString()}`,
      content: toBase64(content),
      sha: state.remoteSha,
      branch: state.settings.branch
    });
    state.remoteSha = response.content.sha;
    localStorage.setItem(STORAGE_KEYS.draft, JSON.stringify(state.data));
    setSyncStatus("Lagret til GitHub.", "good");
  } catch (error) {
    console.error(error);
    state.remoteSha = "";
    setSyncStatus("GitHub-lagring feilet. Endringen ligger lokalt.", "bad");
  } finally {
    state.isSaving = false;
  }
}

function stripRuntimeFields(data) {
  return {
    project: data.project || CONFIG.projectName || "Mail",
    updatedAt: data.updatedAt || "",
    stages: STAGES.map((stage) => stage.id),
    shots: data.shots.map(({ id, title, scene, image, onedriveUrl, assignee, notes, updatedAt, tasks }) => ({
      id,
      title,
      scene,
      image,
      onedriveUrl,
      assignee: normalizeAssignee(assignee),
      notes,
      updatedAt,
      tasks
    }))
  };
}

async function fetchGitHubData() {
  const response = await githubRequest("GET", `${contentsUrl()}?ref=${encodeURIComponent(state.settings.branch)}`);
  const json = fromBase64(response.content.replace(/\n/g, ""));
  return { data: JSON.parse(json), sha: response.sha };
}

async function githubRequest(method, url, body) {
  const token = getToken();
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  if (!response.ok) {
    throw new Error(`GitHub ${method} failed: ${response.status}`);
  }
  return response.json();
}

function contentsUrl() {
  const path = state.settings.dataPath.split("/").map(encodeURIComponent).join("/");
  return `https://api.github.com/repos/${state.settings.owner}/${state.settings.repo}/contents/${path}`;
}

function getToken() {
  return localStorage.getItem(STORAGE_KEYS.token) || "";
}

function normalizeAssignee(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "nico") return "nicolai";
  return ASSIGNEES.some((person) => person.id === normalized) ? normalized : "";
}

function getAssigneeLabel(value) {
  return ASSIGNEES.find((person) => person.id === value)?.label || "";
}

function togglePreview() {
  document.body.classList.toggle("preview-open");
  updateVideoUi();
  refreshIcons();
}

function closePreview() {
  document.body.classList.remove("preview-open");
  refreshIcons();
}

function toggleVideoPlayback() {
  if (els.previsVideo.paused) {
    els.previsVideo.play();
  } else {
    els.previsVideo.pause();
  }
}

function updateVideoUi() {
  const duration = Number.isFinite(els.previsVideo.duration) ? els.previsVideo.duration : 0;
  const progress = duration ? (els.previsVideo.currentTime / duration) * 1000 : 0;
  els.videoTimeline.value = String(Math.round(progress));
  els.videoCurrentTime.textContent = formatTime(els.previsVideo.currentTime);
  els.videoDuration.textContent = formatTime(duration);
  els.videoFrame.classList.toggle("playing", !els.previsVideo.paused);
  const icon = els.previsVideo.paused ? "play" : "pause";
  els.videoOverlayButton.innerHTML = `<i data-lucide="${icon}"></i>`;
  els.videoPlayButton.innerHTML = `<i data-lucide="${icon}"></i>`;
  refreshIcons();
}

function formatTime(seconds) {
  const safeSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function getProgress(shot) {
  if (shot.tasks?.done) return 100;
  const checked = STAGES.filter((stage) => shot.tasks?.[stage.id]).length;
  return Math.round((checked / STAGES.length) * 100);
}

function needsAttention(shot) {
  const progress = getProgress(shot);
  if (progress === 0 || progress === 100) return false;
  return !shot.tasks.camera || !shot.tasks.render || !shot.tasks.compositing;
}

function compareShotIds(a, b) {
  const parse = (id) => (id.match(/scene_(\d+)_shot_(\d+)/) || []).slice(1).map(Number);
  const [sceneA, shotA] = parse(a);
  const [sceneB, shotB] = parse(b);
  return sceneA - sceneB || shotA - shotB || a.localeCompare(b);
}

async function verifyPassword(password) {
  const expected = CONFIG.editPasswordHash;
  if (!expected) return true;
  return (await sha256(password)) === expected;
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function lockEditing() {
  state.unlocked = false;
  setLockedClass();
  render();
  showPasswordGate();
  setSyncStatus("Siden er låst.", "good");
}

function setLockedClass() {
  document.body.classList.toggle("locked", !state.unlocked);
  document.body.classList.toggle("auth-gated", !state.unlocked);
  els.unlockButton.innerHTML = state.unlocked
    ? '<i data-lucide="lock"></i>Lås'
    : '<i data-lucide="lock-keyhole"></i>Rediger';
  refreshIcons();
}

function showPasswordGate() {
  if (state.unlocked || els.unlockDialog.open) return;
  els.passwordInput.value = "";
  els.unlockDialog.showModal();
  setTimeout(() => els.passwordInput.focus(), 40);
}

function setSyncStatus(message, tone = "") {
  els.syncStatus.textContent = message;
  els.syncStatus.dataset.tone = tone;
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function readJson(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function toBase64(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function fromBase64(value) {
  return decodeURIComponent(escape(atob(value)));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value = "") {
  return escapeHtml(value);
}
