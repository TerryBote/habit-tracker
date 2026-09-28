(() => {
  "use strict";

  const STORAGE_KEY = "habit-tracker:v1";
  const MAX_HABIT_NAME_LENGTH = 24;
  const DEFAULT_HABIT_NAMES = [
    "健身",
    "羽毛球",
    "篮球",
    "吉他",
    "跳舞",
    "学习编程",
  ];
  const CHECK_ICON = `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m4.2 10.4 3.4 3.4 8.2-8.2" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;
  const EDIT_ICON = `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m12.8 3.1 4.1 4.1L7.6 16.5l-4.7.6.6-4.7 9.3-9.3Z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
      <path d="m11.5 4.5 4 4" fill="none" stroke="currentColor" stroke-width="1.6"/>
    </svg>
  `;
  const DELETE_ICON = `
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.5 6h11M8 3.5h4M6.2 6l.7 10.2h6.2L13.8 6M8.4 9v4.4M11.6 9v4.4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  const elements = {
    currentDate: document.querySelector("#current-date"),
    completedCount: document.querySelector("#completed-count"),
    totalCount: document.querySelector("#total-count"),
    progressTrack: document.querySelector("#progress-track"),
    progressFill: document.querySelector("#progress-fill"),
    summaryMessage: document.querySelector("#summary-message"),
    habitList: document.querySelector("#habit-list"),
    emptyState: document.querySelector("#empty-state"),
    addHabitButton: document.querySelector("#add-habit-button"),
    storageWarning: document.querySelector("#storage-warning"),
    dialog: document.querySelector("#habit-dialog"),
    form: document.querySelector("#habit-form"),
    dialogEyebrow: document.querySelector("#dialog-eyebrow"),
    dialogTitle: document.querySelector("#dialog-title"),
    nameInput: document.querySelector("#habit-name"),
    nameLength: document.querySelector("#name-length"),
    formError: document.querySelector("#habit-error"),
    cancelDialogButton: document.querySelector("#cancel-dialog"),
    saveHabitButton: document.querySelector("#save-habit"),
  };

  let memoryOnly = false;
  let state = loadState();
  let editingHabitId = null;
  let returnFocusTarget = null;

  persistState();
  render();
  bindEvents();
  checkForNewDay();

  function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function createDefaultState() {
    const createdAt = new Date().toISOString();
    return {
      habits: DEFAULT_HABIT_NAMES.map((name, index) => ({
        id: `default-habit-${index + 1}`,
        name,
        createdAt,
      })),
      completedIds: [],
      lastDate: getLocalDateKey(),
    };
  }

  function loadState() {
    const today = getLocalDateKey();
    let rawValue;

    try {
      rawValue = window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      memoryOnly = true;
      return createDefaultState();
    }

    if (!rawValue) {
      return createDefaultState();
    }

    let parsed;

    try {
      parsed = JSON.parse(rawValue);
    } catch (error) {
      return createDefaultState();
    }

    if (!isRecord(parsed) || !Array.isArray(parsed.habits)) {
      return createDefaultState();
    }

    const seenIds = new Set();
    const habits = [];

    for (const candidate of parsed.habits) {
      if (!isRecord(candidate)) {
        continue;
      }

      const id = typeof candidate.id === "string" ? candidate.id.trim() : "";
      const name = normalizeName(candidate.name);

      if (!id || !name || seenIds.has(id)) {
        continue;
      }

      seenIds.add(id);
      habits.push({
        id,
        name: truncateName(name),
        createdAt:
          typeof candidate.createdAt === "string"
            ? candidate.createdAt
            : new Date().toISOString(),
      });
    }

    if (parsed.habits.length > 0 && habits.length === 0) {
      return createDefaultState();
    }

    const completedIds = Array.isArray(parsed.completedIds)
      ? [...new Set(parsed.completedIds)].filter(
          (id) => typeof id === "string" && seenIds.has(id),
        )
      : [];

    const lastDate =
      typeof parsed.lastDate === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.lastDate)
        ? parsed.lastDate
        : today;

    return {
      habits,
      completedIds: lastDate === today ? completedIds : [],
      lastDate: today,
    };
  }

  function persistState() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      memoryOnly = false;
    } catch (error) {
      memoryOnly = true;
    }

    elements.storageWarning.hidden = !memoryOnly;
  }

  function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeName(value) {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim().replace(/\s+/g, " ");
  }

  function truncateName(value) {
    return Array.from(value).slice(0, MAX_HABIT_NAME_LENGTH).join("");
  }

  function normalizeForComparison(value) {
    return normalizeName(value).toLocaleLowerCase("zh-CN").normalize("NFKC");
  }

  function createId() {
    if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
      return globalThis.crypto.randomUUID();
    }

    return `habit-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 10)}`;
  }

  function render({ animatedHabitId = null } = {}) {
    const total = state.habits.length;
    const completed = state.habits.filter((habit) =>
      state.completedIds.includes(habit.id),
    ).length;
    const ratio = total === 0 ? 0 : completed / total;

    elements.currentDate.textContent = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    }).format(new Date());
    elements.completedCount.textContent = String(completed);
    elements.totalCount.textContent = String(total);
    elements.progressTrack.setAttribute("aria-valuemax", String(Math.max(total, 1)));
    elements.progressTrack.setAttribute("aria-valuenow", String(completed));
    elements.progressTrack.setAttribute(
      "aria-valuetext",
      total === 0 ? "暂无习惯" : `已完成 ${completed} 项，共 ${total} 项`,
    );
    elements.progressFill.style.transform = `scaleX(${ratio})`;
    elements.summaryMessage.textContent = getSummaryMessage(completed, total);
    document.title = total === 0 ? "钉住今天" : `钉住今天 · ${completed}/${total}`;

    const fragment = document.createDocumentFragment();

    for (const habit of state.habits) {
      const isComplete = state.completedIds.includes(habit.id);
      fragment.append(
        createHabitItem(habit, isComplete, habit.id === animatedHabitId),
      );
    }

    elements.habitList.replaceChildren(fragment);
    elements.emptyState.hidden = total !== 0;
  }

  function getSummaryMessage(completed, total) {
    if (total === 0) {
      return "没有目标。先钉住一个吧。";
    }

    if (completed === 0) {
      return "第一颗钉子，交给你。";
    }

    if (completed === total) {
      return "全部钉牢。今天，收工。";
    }

    return `还剩 ${total - completed} 项，别松手。`;
  }

  function createHabitItem(habit, isComplete, animateCompletion = false) {
    const item = document.createElement("li");
    item.className = `habit-item${isComplete ? " is-complete" : ""}${
      animateCompletion ? " just-completed" : ""
    }`;
    item.dataset.habitId = habit.id;

    const toggle = document.createElement("button");
    toggle.className = "habit-toggle";
    toggle.type = "button";
    toggle.dataset.action = "toggle";
    toggle.setAttribute("aria-pressed", String(isComplete));
    toggle.setAttribute(
      "aria-label",
      `${isComplete ? "取消完成" : "标记完成"}：${habit.name}`,
    );

    const check = document.createElement("span");
    check.className = "habit-check";
    check.setAttribute("aria-hidden", "true");
    check.innerHTML = CHECK_ICON;

    const name = document.createElement("span");
    name.className = "habit-name";
    name.textContent = habit.name;

    toggle.append(check, name);

    const actions = document.createElement("div");
    actions.className = "habit-actions";

    const editButton = document.createElement("button");
    editButton.className = "icon-button";
    editButton.type = "button";
    editButton.dataset.action = "edit";
    editButton.setAttribute("aria-label", `重命名：${habit.name}`);
    editButton.title = "重命名";
    editButton.innerHTML = EDIT_ICON;

    const deleteButton = document.createElement("button");
    deleteButton.className = "icon-button";
    deleteButton.type = "button";
    deleteButton.dataset.action = "delete";
    deleteButton.setAttribute("aria-label", `删除：${habit.name}`);
    deleteButton.title = "删除";
    deleteButton.innerHTML = DELETE_ICON;

    actions.append(editButton, deleteButton);
    item.append(toggle, actions);
    return item;
  }

  function toggleHabit(habitId) {
    if (!state.habits.some((habit) => habit.id === habitId)) {
      return;
    }

    const wasComplete = state.completedIds.includes(habitId);

    if (wasComplete) {
      state.completedIds = state.completedIds.filter((id) => id !== habitId);
    } else {
      state.completedIds = [...state.completedIds, habitId];
    }

    state.lastDate = getLocalDateKey();
    persistState();
    render({ animatedHabitId: wasComplete ? null : habitId });
    focusHabitControl(habitId, "toggle");
  }

  function deleteHabit(habitId) {
    const index = state.habits.findIndex((habit) => habit.id === habitId);

    if (index === -1) {
      return;
    }

    const habit = state.habits[index];
    const confirmed = window.confirm(
      `确定删除“${habit.name}”吗？\n删除后，它今天已完成的记录也会一起移除。`,
    );

    if (!confirmed) {
      return;
    }

    state.habits.splice(index, 1);
    state.completedIds = state.completedIds.filter((id) => id !== habitId);
    persistState();
    render();

    const nextHabit = state.habits[Math.min(index, state.habits.length - 1)];

    if (nextHabit) {
      focusHabitControl(nextHabit.id, "toggle");
    } else {
      elements.addHabitButton.focus();
    }
  }

  function openHabitDialog(habit = null) {
    editingHabitId = habit ? habit.id : null;
    returnFocusTarget = document.activeElement;
    elements.dialogEyebrow.textContent = habit ? "编辑" : "新建";
    elements.dialogTitle.textContent = habit ? "重命名习惯" : "添加习惯";
    elements.saveHabitButton.textContent = habit ? "保存" : "添加";
    elements.nameInput.value = habit ? habit.name : "";
    elements.formError.textContent = "";
    elements.nameInput.setAttribute("aria-invalid", "false");
    updateNameLength();

    if (typeof elements.dialog.showModal === "function") {
      if (!elements.dialog.open) {
        elements.dialog.showModal();
      }
    } else {
      elements.dialog.setAttribute("open", "");
    }

    window.requestAnimationFrame(() => {
      elements.nameInput.focus();
      elements.nameInput.select();
    });
  }

  function closeHabitDialog({ restoreFocus = true } = {}) {
    const focusTarget = returnFocusTarget;

    if (typeof elements.dialog.close === "function" && elements.dialog.open) {
      elements.dialog.close();
    } else {
      elements.dialog.removeAttribute("open");
    }

    editingHabitId = null;
    returnFocusTarget = null;

    if (restoreFocus && focusTarget && focusTarget.isConnected) {
      focusTarget.focus();
    }
  }

  function submitHabitForm(event) {
    event.preventDefault();

    const name = normalizeName(elements.nameInput.value);
    const characterCount = Array.from(name).length;

    if (!name) {
      showFormError("请输入习惯名称。");
      return;
    }

    if (characterCount > MAX_HABIT_NAME_LENGTH) {
      showFormError(`名称不能超过 ${MAX_HABIT_NAME_LENGTH} 个字符。`);
      return;
    }

    const duplicate = state.habits.some(
      (habit) =>
        habit.id !== editingHabitId &&
        normalizeForComparison(habit.name) === normalizeForComparison(name),
    );

    if (duplicate) {
      showFormError("已经有同名习惯了。");
      return;
    }

    let focusHabitId;

    if (editingHabitId) {
      const habit = state.habits.find((item) => item.id === editingHabitId);

      if (!habit) {
        closeHabitDialog();
        return;
      }

      habit.name = name;
      focusHabitId = habit.id;
    } else {
      const habit = {
        id: createId(),
        name,
        createdAt: new Date().toISOString(),
      };

      state.habits.push(habit);
      focusHabitId = habit.id;
    }

    state.lastDate = getLocalDateKey();
    persistState();
    closeHabitDialog({ restoreFocus: false });
    render();

    window.requestAnimationFrame(() => {
      focusHabitControl(focusHabitId, "toggle");
    });
  }

  function showFormError(message) {
    elements.formError.textContent = message;
    elements.nameInput.setAttribute("aria-invalid", "true");
    elements.nameInput.focus();
  }

  function updateNameLength() {
    const length = Array.from(elements.nameInput.value).length;
    elements.nameLength.textContent = `${length}/${MAX_HABIT_NAME_LENGTH}`;
  }

  function focusHabitControl(habitId, action) {
    const item = Array.from(elements.habitList.children).find(
      (candidate) => candidate.dataset.habitId === habitId,
    );
    const control = item && item.querySelector(`[data-action="${action}"]`);

    if (control) {
      control.focus({ preventScroll: true });
    }
  }

  function checkForNewDay() {
    const today = getLocalDateKey();

    if (state.lastDate === today) {
      return;
    }

    state.lastDate = today;
    state.completedIds = [];
    persistState();
    render();
  }

  function bindEvents() {
    elements.addHabitButton.addEventListener("click", () => openHabitDialog());

    elements.habitList.addEventListener("click", (event) => {
      const button = event.target.closest?.("button[data-action]");
      const item = button?.closest("[data-habit-id]");

      if (!button || !item) {
        return;
      }

      const habitId = item.dataset.habitId;

      switch (button.dataset.action) {
        case "toggle":
          toggleHabit(habitId);
          break;
        case "edit": {
          const habit = state.habits.find((candidate) => candidate.id === habitId);

          if (habit) {
            openHabitDialog(habit);
          }
          break;
        }
        case "delete":
          deleteHabit(habitId);
          break;
      }
    });

    elements.form.addEventListener("submit", submitHabitForm);
    elements.cancelDialogButton.addEventListener("click", () => closeHabitDialog());
    elements.nameInput.addEventListener("input", () => {
      updateNameLength();

      if (elements.nameInput.getAttribute("aria-invalid") === "true") {
        elements.nameInput.setAttribute("aria-invalid", "false");
        elements.formError.textContent = "";
      }
    });

    elements.dialog.addEventListener("click", (event) => {
      if (event.target === elements.dialog) {
        closeHabitDialog();
      }
    });

    elements.dialog.addEventListener("close", () => {
      editingHabitId = null;
      returnFocusTarget = null;
    });

    window.addEventListener("focus", checkForNewDay);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        checkForNewDay();
      }
    });
    window.setInterval(checkForNewDay, 60_000);
  }
})();
