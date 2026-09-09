const form = document.querySelector("#site-form");
const input = document.querySelector("#site-url");
const error = document.querySelector("#error");
const list = document.querySelector("#enabled-hosts");
const familiarSearch = document.querySelector("#familiar-search");
const familiarList = document.querySelector("#familiar-words");
const vocabSearch = document.querySelector("#vocab-search");
const vocabList = document.querySelector("#vocab-book");
const masteryFilters = document.querySelectorAll("input[name=\"mastery-filter\"]");
let familiarWords = [];
let vocabBook = {};

async function getEnabledHosts() {
  const stored = await chrome.storage.local.get({ enabledHosts: [] });
  return stored.enabledHosts;
}

function renderEnabledHosts(hosts) {
  list.replaceChildren(
    ...hosts.map((host) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = host;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "移除";
      removeButton.setAttribute("aria-label", `移除 ${host}`);
      removeButton.addEventListener("click", async () => {
        const enabledHosts = hosts.filter((candidate) => candidate !== host);
        await chrome.storage.local.set({ enabledHosts });
        renderEnabledHosts(enabledHosts);
      });
      item.append(label, removeButton);
      return item;
    }),
  );
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  error.hidden = true;

  try {
    const url = new URL(input.value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("unsupported protocol");
    }

    const hosts = await getEnabledHosts();
    const enabledHosts = [...new Set([...hosts, url.hostname.toLowerCase()])].sort();
    await chrome.storage.local.set({ enabledHosts });
    renderEnabledHosts(enabledHosts);
    form.reset();
  } catch {
    error.textContent = "请输入有效的 http 或 https 页面网址";
    error.hidden = false;
  }
});

void getEnabledHosts().then(renderEnabledHosts);

function renderFamiliarWords() {
  const query = familiarSearch.value.trim().toLowerCase();
  const visibleWords = familiarWords.filter((word) => word.includes(query));
  familiarList.replaceChildren(
    ...visibleWords.map((word) => {
      const item = document.createElement("li");
      const label = document.createElement("span");
      label.textContent = word;
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.textContent = "移除";
      removeButton.setAttribute("aria-label", `移除 ${word}`);
      removeButton.addEventListener("click", async () => {
        const stored = await chrome.storage.local.get({ familiarWords: [], vocabBook: {} });
        const nextFamiliarWords = stored.familiarWords.filter((candidate) => candidate !== word);
        const nextVocabBook = { ...stored.vocabBook };
        if (nextVocabBook[word]) {
          nextVocabBook[word] = { ...nextVocabBook[word], mastered: false };
        }
        await chrome.storage.local.set({ familiarWords: nextFamiliarWords, vocabBook: nextVocabBook });
        familiarWords = nextFamiliarWords;
        vocabBook = nextVocabBook;
        renderFamiliarWords();
        renderVocabBook();
      });
      item.append(label, removeButton);
      return item;
    }),
  );
}

async function loadFamiliarWords() {
  const stored = await chrome.storage.local.get({ familiarWords: [] });
  familiarWords = stored.familiarWords;
  renderFamiliarWords();
}

familiarSearch.addEventListener("input", renderFamiliarWords);
void loadFamiliarWords();

function getMasteryFilter() {
  for (const filter of masteryFilters) {
    if (filter.checked) return filter.value;
  }
  return "all";
}

async function setMastered(word, mastered) {
  const stored = await chrome.storage.local.get({ familiarWords: [], vocabBook: {} });
  const nextVocabBook = { ...stored.vocabBook };
  if (nextVocabBook[word]) {
    nextVocabBook[word] = { ...nextVocabBook[word], mastered };
  }
  const nextFamiliarWords = mastered
    ? [...new Set([...stored.familiarWords, word])]
    : stored.familiarWords.filter((candidate) => candidate !== word);
  await chrome.storage.local.set({ vocabBook: nextVocabBook, familiarWords: nextFamiliarWords });
  vocabBook = nextVocabBook;
  familiarWords = nextFamiliarWords;
  renderVocabBook();
  renderFamiliarWords();
}

function renderVocabBook() {
  const query = vocabSearch.value.trim().toLowerCase();
  const filter = getMasteryFilter();
  const entries = Object.entries(vocabBook)
    .filter(([word]) => word.includes(query))
    .filter(([, entry]) => {
      if (filter === "mastered") return entry.mastered;
      if (filter === "unmastered") return !entry.mastered;
      return true;
    })
    .sort(([a], [b]) => a.localeCompare(b));

  vocabList.replaceChildren(
    ...entries.map(([word, entry]) => {
      const item = document.createElement("li");

      const wordLabel = document.createElement("span");
      wordLabel.className = "vocab-word";
      wordLabel.textContent = word;

      const definitionLabel = document.createElement("span");
      definitionLabel.className = "vocab-definition";
      definitionLabel.textContent = entry.definition;

      const masteryLabel = document.createElement("span");
      masteryLabel.className = "vocab-mastery";
      masteryLabel.textContent = entry.mastered ? "已掌握" : "未掌握";

      const toggleButton = document.createElement("button");
      toggleButton.type = "button";
      toggleButton.textContent = entry.mastered ? "标记未掌握" : "标记已掌握";
      toggleButton.addEventListener("click", () => {
        void setMastered(word, !entry.mastered);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "删除";
      deleteButton.setAttribute("aria-label", `删除 ${word}`);
      deleteButton.addEventListener("click", async () => {
        const stored = await chrome.storage.local.get({ vocabBook: {} });
        const nextVocabBook = { ...stored.vocabBook };
        delete nextVocabBook[word];
        await chrome.storage.local.set({ vocabBook: nextVocabBook });
        vocabBook = nextVocabBook;
        renderVocabBook();
      });

      item.append(wordLabel, definitionLabel, masteryLabel, toggleButton, deleteButton);
      return item;
    }),
  );
}

async function loadVocabBook() {
  const stored = await chrome.storage.local.get({ vocabBook: {} });
  vocabBook = stored.vocabBook;
  renderVocabBook();
}

vocabSearch.addEventListener("input", renderVocabBook);
for (const filter of masteryFilters) {
  filter.addEventListener("change", renderVocabBook);
}
void loadVocabBook();

const deepseekKey = document.querySelector("#deepseek-key");
const deepseekSave = document.querySelector("#deepseek-save");
const deepseekDelete = document.querySelector("#deepseek-delete");
const deepseekStatus = document.querySelector("#deepseek-status");

function showDeepSeekStatus(message) {
  deepseekStatus.textContent = message;
  deepseekStatus.hidden = false;
}

async function loadDeepSeekKey() {
  const stored = await chrome.storage.local.get({ deepseekApiKey: "" });
  deepseekKey.value = stored.deepseekApiKey || "";
  deepseekDelete.disabled = !stored.deepseekApiKey;
}

deepseekSave.addEventListener("click", async () => {
  const value = deepseekKey.value.trim();
  if (!value) {
    showDeepSeekStatus("请输入 API Key");
    return;
  }
  await chrome.storage.local.set({ deepseekApiKey: value });
  deepseekDelete.disabled = false;
  showDeepSeekStatus("已保存");
});

deepseekDelete.addEventListener("click", async () => {
  await chrome.storage.local.remove("deepseekApiKey");
  deepseekKey.value = "";
  deepseekDelete.disabled = true;
  showDeepSeekStatus("已删除");
});

void loadDeepSeekKey();

const BACKUP_VERSION = 1;

const exportData = document.querySelector("#export-data");
const importFile = document.querySelector("#import-file");
const importPreview = document.querySelector("#import-preview");
const importSummary = document.querySelector("#import-summary");
const importWarning = document.querySelector("#import-warning");
const importConfirm = document.querySelector("#import-confirm");
const importCancel = document.querySelector("#import-cancel");
const importStatus = document.querySelector("#import-status");

let pendingImport = null;

async function getLearningData() {
  const stored = await chrome.storage.local.get({
    familiarWords: [],
    vocabBook: {},
    enabledHosts: [],
  });
  return {
    familiarWords: stored.familiarWords,
    vocabBook: stored.vocabBook,
    enabledHosts: stored.enabledHosts,
  };
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function isStringArray(value) {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function validateBackup(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, error: "备份文件必须是 JSON 对象" };
  }
  if (value.version !== BACKUP_VERSION) {
    return { ok: false, error: `不支持的备份版本（支持版本 ${BACKUP_VERSION}）` };
  }
  if (!isStringArray(value.familiarWords)) {
    return { ok: false, error: "熟词表数据无效" };
  }
  if (
    typeof value.vocabBook !== "object" ||
    value.vocabBook === null ||
    Array.isArray(value.vocabBook) ||
    Object.entries(value.vocabBook).some(
      ([word, entry]) =>
        !isNonEmptyString(word) ||
        typeof entry !== "object" ||
        entry === null ||
        !isNonEmptyString(entry.definition) ||
        typeof entry.mastered !== "boolean",
    )
  ) {
    return { ok: false, error: "生词本数据无效" };
  }
  if (!isStringArray(value.enabledHosts)) {
    return { ok: false, error: "启用网站数据无效" };
  }
  return {
    ok: true,
    data: {
      familiarWords: [...value.familiarWords],
      vocabBook: Object.fromEntries(
        Object.entries(value.vocabBook).map(([word, entry]) => [
          word,
          { definition: entry.definition, mastered: entry.mastered },
        ]),
      ),
      enabledHosts: [...value.enabledHosts],
    },
  };
}

function showImportStatus(message) {
  importStatus.textContent = message;
  importStatus.hidden = false;
}

function hideImportPreview() {
  importPreview.hidden = true;
}

function resetImportPicker() {
  importFile.value = "";
}

function renderImportPreview(data) {
  const familiarCount = data.familiarWords.length;
  const vocabCount = Object.keys(data.vocabBook).length;
  const hostCount = data.enabledHosts.length;
  importSummary.textContent = `熟词表 ${familiarCount} 个、生词本 ${vocabCount} 个、启用网站 ${hostCount} 个`;
  importWarning.textContent =
    familiarCount === 0 && vocabCount === 0 && hostCount === 0
      ? "备份中三个集合均为空，导入将清空熟词表、生词本和启用网站。"
      : "导入将完全替换当前的学习数据，此操作无法撤销。";
  importPreview.hidden = false;
}

exportData.addEventListener("click", async () => {
  const backup = {
    version: BACKUP_VERSION,
    ...(await getLearningData()),
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "niubifanyi-backup.json";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});

importFile.addEventListener("change", async () => {
  importStatus.hidden = true;
  const file = importFile.files?.[0];
  if (!file) return;

  let text;
  try {
    text = await file.text();
  } catch {
    pendingImport = null;
    hideImportPreview();
    showImportStatus("无法读取备份文件");
    return;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    pendingImport = null;
    hideImportPreview();
    showImportStatus("备份文件不是有效的 JSON");
    return;
  }

  const result = validateBackup(parsed);
  if (!result.ok) {
    pendingImport = null;
    hideImportPreview();
    showImportStatus(result.error);
    return;
  }

  pendingImport = result.data;
  renderImportPreview(result.data);
});

importConfirm.addEventListener("click", async () => {
  if (!pendingImport) return;
  const data = pendingImport;
  try {
    await chrome.storage.local.set({
      familiarWords: data.familiarWords,
      vocabBook: data.vocabBook,
      enabledHosts: data.enabledHosts,
    });
  } catch {
    showImportStatus("导入失败，未修改当前数据");
    return;
  }
  pendingImport = null;
  familiarWords = data.familiarWords;
  vocabBook = data.vocabBook;
  hideImportPreview();
  resetImportPicker();
  renderEnabledHosts(data.enabledHosts);
  renderFamiliarWords();
  renderVocabBook();
  showImportStatus("已导入学习数据");
});

importCancel.addEventListener("click", () => {
  pendingImport = null;
  hideImportPreview();
  resetImportPicker();
  showImportStatus("已取消导入");
});
