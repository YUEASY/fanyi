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
