const form = document.querySelector("#site-form");
const input = document.querySelector("#site-url");
const error = document.querySelector("#error");
const list = document.querySelector("#enabled-hosts");
const familiarSearch = document.querySelector("#familiar-search");
const familiarList = document.querySelector("#familiar-words");
let familiarWords = [];

async function getEnabledHosts() {
  const stored = await chrome.storage.local.get({ enabledHosts: [] });
  return stored.enabledHosts;
}

function renderEnabledHosts(hosts) {
  list.replaceChildren(
    ...hosts.map((host) => {
      const item = document.createElement("li");
      item.textContent = host;
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
        const stored = await chrome.storage.local.get({ removedFamiliarLemmas: [] });
        familiarWords = familiarWords.filter((candidate) => candidate !== word);
        const removedFamiliarLemmas = [
          ...new Set([...stored.removedFamiliarLemmas, word]),
        ];
        await chrome.storage.local.set({ familiarWords, removedFamiliarLemmas });
        renderFamiliarWords();
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
