const STORAGE_KEY = "daily-checkin:v1";

const defaultState = {
  tasks: [
    {
      id: "wake-up",
      time: "09:00",
      action: "起床",
      standard: "09:30前",
    },
  ],
  completions: {},
};

const state = loadState();

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  scoreValue: document.querySelector("#scoreValue"),
  doneCount: document.querySelector("#doneCount"),
  totalCount: document.querySelector("#totalCount"),
  streakCount: document.querySelector("#streakCount"),
  taskList: document.querySelector("#taskList"),
  historyList: document.querySelector("#historyList"),
  manageList: document.querySelector("#manageList"),
  taskTemplate: document.querySelector("#taskTemplate"),
  taskForm: document.querySelector("#taskForm"),
  taskId: document.querySelector("#taskId"),
  taskTime: document.querySelector("#taskTime"),
  taskAction: document.querySelector("#taskAction"),
  taskStandard: document.querySelector("#taskStandard"),
  clearFormButton: document.querySelector("#clearFormButton"),
  resetTodayButton: document.querySelector("#resetTodayButton"),
  exportButton: document.querySelector("#exportButton"),
};

init();

function init() {
  els.todayLabel.textContent = formatDateLabel(new Date());
  bindTabs();
  bindActions();
  render();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

function bindTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("is-active"));
      document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.querySelector(`#${target}Panel`).classList.add("is-active");
    });
  });
}

function bindActions() {
  els.taskForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const id = els.taskId.value || crypto.randomUUID();
    const nextTask = {
      id,
      time: els.taskTime.value,
      action: els.taskAction.value.trim(),
      standard: els.taskStandard.value.trim(),
    };

    const index = state.tasks.findIndex((task) => task.id === id);
    if (index >= 0) {
      state.tasks[index] = nextTask;
    } else {
      state.tasks.push(nextTask);
    }

    state.tasks.sort((a, b) => a.time.localeCompare(b.time));
    clearForm();
    saveState();
    render();
  });

  els.clearFormButton.addEventListener("click", clearForm);

  els.resetTodayButton.addEventListener("click", () => {
    state.completions[todayKey()] = {};
    saveState();
    render();
  });

  els.exportButton.addEventListener("click", exportData);
}

function render() {
  renderSummary();
  renderTasks();
  renderHistory();
  renderManageList();
}

function renderSummary() {
  const today = todayKey();
  const done = getDoneCount(today);
  const total = state.tasks.length;
  const score = total === 0 ? 0 : Math.round((done / total) * 100);

  els.doneCount.textContent = done;
  els.totalCount.textContent = total;
  els.scoreValue.textContent = `${score}%`;
  els.streakCount.textContent = getStreak();
  document.documentElement.style.setProperty("--score-angle", `${score * 3.6}deg`);
}

function renderTasks() {
  els.taskList.replaceChildren();

  if (state.tasks.length === 0) {
    els.taskList.append(emptyNode("还没有事项"));
    return;
  }

  const today = todayKey();
  state.tasks.forEach((task) => {
    const node = els.taskTemplate.content.firstElementChild.cloneNode(true);
    const isDone = Boolean(state.completions[today]?.[task.id]);
    node.classList.toggle("is-done", isDone);
    node.querySelector("time").textContent = task.time;
    node.querySelector("h3").textContent = task.action;
    node.querySelector("p").textContent = `完成标准：${task.standard}`;

    const button = node.querySelector(".check-button");
    button.textContent = isDone ? "已打卡" : "打卡";
    button.classList.toggle("is-done", isDone);
    button.addEventListener("click", () => {
      toggleTask(task.id);
    });

    els.taskList.append(node);
  });
}

function renderHistory() {
  els.historyList.replaceChildren();

  if (state.tasks.length === 0) {
    els.historyList.append(emptyNode("暂无记录"));
    return;
  }

  getRecentDates(14).forEach((date) => {
    const total = state.tasks.length;
    const done = getDoneCount(date);
    const score = total === 0 ? 0 : Math.round((done / total) * 100);
    const row = document.createElement("article");
    row.className = "history-row";
    row.innerHTML = `
      <strong>${formatShortDate(date)}</strong>
      <div class="bar" aria-label="完成率 ${score}%"><i style="--bar-width: ${score}%"></i></div>
      <span>${done}/${total}</span>
    `;
    els.historyList.append(row);
  });
}

function renderManageList() {
  els.manageList.replaceChildren();

  if (state.tasks.length === 0) {
    els.manageList.append(emptyNode("添加第一条事项"));
    return;
  }

  state.tasks.forEach((task) => {
    const item = document.createElement("article");
    item.className = "manage-item";
    item.innerHTML = `
      <div>
        <strong>${task.time} ${escapeHtml(task.action)}</strong>
        <p>${escapeHtml(task.standard)}</p>
      </div>
      <div class="manage-actions">
        <button class="small-button" type="button" title="编辑" aria-label="编辑">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>
        <button class="small-button danger-button" type="button" title="删除" aria-label="删除">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 6h18" />
            <path d="M8 6V4h8v2" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v5" />
            <path d="M14 11v5" />
          </svg>
        </button>
      </div>
    `;

    const [editButton, deleteButton] = item.querySelectorAll("button");
    editButton.addEventListener("click", () => editTask(task.id));
    deleteButton.addEventListener("click", () => deleteTask(task.id));
    els.manageList.append(item);
  });
}

function toggleTask(taskId) {
  const today = todayKey();
  state.completions[today] ||= {};

  if (state.completions[today][taskId]) {
    delete state.completions[today][taskId];
  } else {
    state.completions[today][taskId] = new Date().toISOString();
  }

  saveState();
  render();
}

function editTask(taskId) {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return;

  els.taskId.value = task.id;
  els.taskTime.value = task.time;
  els.taskAction.value = task.action;
  els.taskStandard.value = task.standard;
  els.taskAction.focus();
}

function deleteTask(taskId) {
  state.tasks = state.tasks.filter((task) => task.id !== taskId);
  Object.values(state.completions).forEach((day) => {
    delete day[taskId];
  });
  saveState();
  render();
}

function clearForm() {
  els.taskId.value = "";
  els.taskTime.value = "";
  els.taskAction.value = "";
  els.taskStandard.value = "";
}

function getDoneCount(dateKey) {
  const day = state.completions[dateKey] || {};
  return state.tasks.filter((task) => day[task.id]).length;
}

function getStreak() {
  if (state.tasks.length === 0) return 0;
  let streak = 0;
  const cursor = new Date();

  while (streak < 365) {
    const key = toDateKey(cursor);
    if (getDoneCount(key) !== state.tasks.length) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function getRecentDates(count) {
  const dates = [];
  const cursor = new Date();
  for (let index = 0; index < count; index += 1) {
    dates.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() - 1);
  }
  return dates;
}

function loadState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!stored || !Array.isArray(stored.tasks)) return structuredClone(defaultState);
    return {
      tasks: stored.tasks,
      completions: stored.completions || {},
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function exportData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `daily-checkin-${todayKey()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function emptyNode(text) {
  const node = document.createElement("div");
  node.className = "empty";
  node.textContent = text;
  return node;
}

function todayKey() {
  return toDateKey(new Date());
}

function toDateKey(date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateLabel(date) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(date);
}

function formatShortDate(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return entities[char];
  });
}
