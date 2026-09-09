const EXCLUDED_SELECTOR =
  "code, pre, script, style, input, textarea, noscript, [hidden], .nbf-potential-word, .nbf-word-popover";
const IRREGULAR_FORMS = new Map([
  ["am", "be"], ["is", "be"], ["are", "be"], ["was", "be"],
  ["were", "be"], ["been", "be"], ["being", "be"],
  ["has", "have"], ["had", "have"], ["having", "have"],
  ["does", "do"], ["did", "do"], ["doing", "do"],
  ["ate", "eat"], ["eaten", "eat"], ["became", "become"],
  ["began", "begin"], ["begun", "begin"], ["broke", "break"],
  ["broken", "break"], ["brought", "bring"], ["bought", "buy"],
  ["caught", "catch"], ["chose", "choose"], ["chosen", "choose"],
  ["came", "come"], ["dealt", "deal"], ["dug", "dig"],
  ["drew", "draw"], ["drawn", "draw"], ["drank", "drink"],
  ["drunk", "drink"], ["drove", "drive"], ["driven", "drive"],
  ["fell", "fall"], ["fallen", "fall"], ["fed", "feed"],
  ["felt", "feel"], ["fought", "fight"], ["found", "find"],
  ["flew", "fly"], ["flown", "fly"], ["forgot", "forget"],
  ["forgotten", "forget"], ["forgave", "forgive"], ["forgiven", "forgive"],
  ["froze", "freeze"], ["frozen", "freeze"], ["got", "get"],
  ["gotten", "get"], ["gave", "give"], ["given", "give"],
  ["went", "go"], ["gone", "go"], ["grew", "grow"], ["grown", "grow"],
  ["heard", "hear"], ["held", "hold"], ["kept", "keep"],
  ["knew", "know"], ["known", "know"], ["left", "leave"],
  ["lost", "lose"], ["made", "make"], ["met", "meet"],
  ["paid", "pay"], ["rode", "ride"], ["ridden", "ride"],
  ["ran", "run"], ["said", "say"], ["saw", "see"], ["seen", "see"],
  ["sold", "sell"], ["sent", "send"], ["shook", "shake"],
  ["shaken", "shake"], ["showed", "show"], ["shown", "show"],
  ["sang", "sing"], ["sung", "sing"], ["sat", "sit"],
  ["slept", "sleep"], ["spoke", "speak"], ["spoken", "speak"],
  ["spent", "spend"], ["stood", "stand"], ["stole", "steal"],
  ["stolen", "steal"], ["swam", "swim"], ["swum", "swim"],
  ["took", "take"], ["taken", "take"], ["taught", "teach"],
  ["told", "tell"], ["thought", "think"], ["threw", "throw"],
  ["thrown", "throw"], ["understood", "understand"], ["woke", "wake"],
  ["woken", "wake"], ["wore", "wear"], ["worn", "wear"],
  ["won", "win"], ["wrote", "write"], ["written", "write"],
  ["children", "child"], ["feet", "foot"], ["geese", "goose"],
  ["men", "man"], ["mice", "mouse"], ["people", "person"],
  ["teeth", "tooth"], ["women", "woman"],
]);
const UNINFLECTED_WORDS = new Set(["news"]);

function getLemma(word, lexicon) {
  const lowerWord = word.toLowerCase();
  if (IRREGULAR_FORMS.has(lowerWord)) return IRREGULAR_FORMS.get(lowerWord);
  if (UNINFLECTED_WORDS.has(lowerWord)) return lowerWord;

  if (lowerWord.endsWith("ies") && lowerWord.length > 3) {
    const candidate = `${lowerWord.slice(0, -3)}y`;
    if (lexicon.has(candidate)) return candidate;
  }
  if (lowerWord.endsWith("es") && lowerWord.length > 2) {
    const withoutS = lowerWord.slice(0, -1);
    if (lexicon.has(withoutS)) return withoutS;
    if (/(?:ches|shes|xes|zes|oes)$/u.test(lowerWord)) {
      const withoutEs = lowerWord.slice(0, -2);
      if (lexicon.has(withoutEs)) return withoutEs;
    }
  }
  if (lowerWord.endsWith("s") && !lowerWord.endsWith("ss")) {
    const candidate = lowerWord.slice(0, -1);
    if (lexicon.has(candidate)) return candidate;
  }

  for (const suffix of ["ing", "ed"]) {
    if (!lowerWord.endsWith(suffix) || lowerWord.length <= suffix.length) continue;
    const stem = lowerWord.slice(0, -suffix.length);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) {
      const withoutDouble = stem.slice(0, -1);
      if (lexicon.has(withoutDouble)) return withoutDouble;
    }
    const withE = `${stem}e`;
    if (lexicon.has(withE) && /[csvzg]$/u.test(stem)) return withE;
    if (lexicon.has(stem)) return stem;
    if (lexicon.has(withE)) return withE;
  }

  return lowerWord;
}

function isVisible(element) {
  if (element.getClientRects().length === 0) return false;
  for (let current = element; current; current = current.parentElement) {
    const style = getComputedStyle(current);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number.parseFloat(style.opacity) === 0
    ) {
      return false;
    }
  }
  return true;
}

function shouldScan(textNode) {
  const parent = textNode.parentElement;
  if (!parent || parent.closest(EXCLUDED_SELECTOR)) return false;
  return isVisible(parent);
}

function getIgnoredRanges(source) {
  const ignoredPattern =
    /(?:https?:\/\/|www\.)[^\s<>"']+|\b(?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,}(?:\/[^\s<>"']*)?|\b[A-Za-z0-9_']*_[A-Za-z0-9_']*\b|\b(?=[A-Za-z0-9']*[A-Za-z])(?=[A-Za-z0-9']*\d)[A-Za-z0-9']+\b|\b[a-z]+(?:[A-Z][A-Za-z]*)+\b/g;
  return Array.from(source.matchAll(ignoredPattern), (match) => {
    const start = match.index ?? 0;
    return { start, end: start + match[0].length };
  });
}

function highlightTextNode(textNode, familiarWords, lexicon) {
  const source = textNode.nodeValue ?? "";
  const wordPattern = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
  const fragment = document.createDocumentFragment();
  const ignoredRanges = getIgnoredRanges(source);
  let cursor = 0;
  let hasPotentialWord = false;

  for (const match of source.matchAll(wordPattern)) {
    const word = match[0];
    const lemma = getLemma(word, lexicon);
    const index = match.index ?? 0;
    fragment.append(source.slice(cursor, index));

    const isIgnored = ignoredRanges.some(
      (range) => index >= range.start && index < range.end,
    );
    if (isIgnored || familiarWords.has(lemma)) {
      fragment.append(word);
    } else {
      const marker = document.createElement("span");
      marker.className = "nbf-potential-word";
      marker.textContent = word;
      marker.dataset.lemma = lemma;
      fragment.append(marker);
      hasPotentialWord = true;
    }
    cursor = index + word.length;
  }

  if (!hasPotentialWord) return;
  fragment.append(source.slice(cursor));
  textNode.replaceWith(fragment);
}

function getScannableTextNodes(root) {
  const textNodes = [];
  if (root.nodeType === Node.TEXT_NODE && shouldScan(root)) textNodes.push(root);

  if (root.nodeType === Node.ELEMENT_NODE || root.nodeType === Node.DOCUMENT_NODE) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      if (shouldScan(walker.currentNode)) textNodes.push(walker.currentNode);
    }
  }
  return textNodes;
}

function highlightPotentialWordsIn(root, familiarWords, lexicon) {
  for (const textNode of getScannableTextNodes(root)) {
    highlightTextNode(textNode, familiarWords, lexicon);
  }
}

function observeDynamicText(familiarWords, lexicon) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        highlightPotentialWordsIn(mutation.target, familiarWords, lexicon);
        continue;
      }
      for (const node of mutation.addedNodes) {
        highlightPotentialWordsIn(node, familiarWords, lexicon);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

async function loadBundledWordList() {
  const response = await fetch(chrome.runtime.getURL("google-10000-english.txt"));
  if (!response.ok) throw new Error("无法加载初始熟词表");
  return (await response.text())
    .split(/\r?\n/u)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

async function getFamiliarWords(bundledWords) {
  const stored = await chrome.storage.local.get({
    familiarWordsInitialized: false,
    familiarWords: [],
  });
  if (stored.familiarWordsInitialized) return new Set(stored.familiarWords);

  const familiarWords = bundledWords.slice(0, 1500);
  await chrome.storage.local.set({
    initialFamiliarWords: familiarWords,
    familiarWords,
    familiarWordsInitialized: true,
  });
  return new Set(familiarWords);
}

async function getVocabBook() {
  const stored = await chrome.storage.local.get({ vocabBook: {} });
  return stored.vocabBook;
}

const DEFAULT_ONLINE_DICTIONARY_URL = "https://api.mymemory.translated.net/get";
const definitionCache = new Map();
let localDictionaryPromise = null;
let onlineDictionaryUrlPromise = null;

function loadLocalDictionary() {
  if (!localDictionaryPromise) {
    localDictionaryPromise = chrome.storage.local
      .get("localDictionary")
      .then(async ({ localDictionary }) => {
        if (
          localDictionary &&
          typeof localDictionary === "object" &&
          !Array.isArray(localDictionary)
        ) {
          return localDictionary;
        }
        const response = await fetch(chrome.runtime.getURL("local-dictionary.json"));
        if (!response.ok) throw new Error("无法加载本地词典");
        return response.json();
      });
  }
  return localDictionaryPromise;
}

function getOnlineDictionaryUrl() {
  if (!onlineDictionaryUrlPromise) {
    onlineDictionaryUrlPromise = chrome.storage.local
      .get("onlineDictionaryUrl")
      .then(({ onlineDictionaryUrl }) => onlineDictionaryUrl || DEFAULT_ONLINE_DICTIONARY_URL);
  }
  return onlineDictionaryUrlPromise;
}

async function fetchOnlineDefinition(lemma) {
  const baseUrl = await getOnlineDictionaryUrl();
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("在线词典地址无效");
  }
  url.searchParams.set("q", lemma);
  url.searchParams.set("langpair", "en|zh-CN");
  let response;
  try {
    response = await fetch(url.toString());
  } catch {
    throw new Error("网络错误，请检查网络连接");
  }
  if (!response.ok) throw new Error(`在线词典返回 HTTP ${response.status}`);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("在线词典响应无法解析");
  }
  const definition = data?.responseData?.translatedText;
  return typeof definition === "string" && definition.trim() ? definition.trim() : null;
}

async function lookupDefinition(lemma) {
  const cached = definitionCache.get(lemma);
  if (cached) return cached;

  const localDictionary = await loadLocalDictionary();
  const local = localDictionary[lemma];
  if (typeof local === "string" && local.trim()) {
    definitionCache.set(lemma, local.trim());
    return local.trim();
  }

  const online = await fetchOnlineDefinition(lemma);
  if (online) definitionCache.set(lemma, online);
  return online;
}

let popoverCloseTimer = null;
let openLemma = null;

function positionPopover(popover, marker) {
  const rect = marker.getBoundingClientRect();
  const gap = 6;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  let left = rect.left;
  if (left + width > viewportWidth - 8) left = Math.max(8, viewportWidth - width - 8);
  let top = rect.bottom + gap;
  if (top + height > viewportHeight - 8) top = Math.max(8, rect.top - height - gap);
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

function renderLoadingDefinition(definitionArea) {
  definitionArea.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "nbf-definition";
  loading.textContent = "查询中…";
  definitionArea.append(loading);
  return loading;
}

async function renderDefinitionResult(definitionArea, lemma, loading, onLookupResult) {
  try {
    const definition = await lookupDefinition(lemma);
    if (!definitionArea.isConnected) return;
    if (definition) {
      loading.textContent = definition;
      onLookupResult?.({ state: "resolved", definition });
    } else {
      loading.textContent = "未找到释义";
      onLookupResult?.({ state: "empty" });
    }
  } catch (error) {
    if (!definitionArea.isConnected) return;
    renderDefinitionError(definitionArea, lemma, error, onLookupResult);
  }
}

function renderDefinitionError(definitionArea, lemma, error, onLookupResult) {
  definitionArea.replaceChildren();
  onLookupResult?.({ state: "error" });
  const reason = document.createElement("p");
  reason.className = "nbf-definition-error";
  reason.textContent = error?.message ?? "查询失败，请稍后重试";
  const retryButton = document.createElement("button");
  retryButton.type = "button";
  retryButton.textContent = "重试";
  retryButton.addEventListener("click", () => {
    const loading = renderLoadingDefinition(definitionArea);
    void renderDefinitionResult(definitionArea, lemma, loading, onLookupResult);
  });
  definitionArea.append(reason, retryButton);
}

const llmResultCache = new Map();

const SENTENCE_TERMINATORS = [".", "!", "?", ";", "\n"];

function getSentenceStart(before) {
  let last = -1;
  for (const separator of SENTENCE_TERMINATORS) {
    const index = before.lastIndexOf(separator);
    if (index > last) last = index;
  }
  return last + 1;
}

function getSentenceEnd(after) {
  let first = -1;
  for (const separator of SENTENCE_TERMINATORS) {
    const index = after.indexOf(separator);
    if (index !== -1 && (first === -1 || index < first)) first = index;
  }
  return first === -1 ? after.length : first + 1;
}

const INLINE_DISPLAYS = new Set(["inline", "contents", "inline-block", "inline-flex", "inline-grid"]);

function findSentenceContainer(marker) {
  let current = marker.parentElement;
  while (current && current !== document.body) {
    const display = getComputedStyle(current).display;
    if (!INLINE_DISPLAYS.has(display)) return current;
    current = current.parentElement;
  }
  return current;
}

function getContainingSentence(marker) {
  const container = findSentenceContainer(marker);
  const fallback = marker.textContent ?? "";
  if (!container) return fallback;
  const fullText = container.textContent ?? "";
  const range = document.createRange();
  range.selectNodeContents(container);
  range.setEndBefore(marker);
  const start = range.toString().length;
  const wordLength = marker.textContent?.length ?? 0;
  const before = fullText.slice(0, start);
  const after = fullText.slice(start + wordLength);
  const sentence = fullText
    .slice(getSentenceStart(before), start + wordLength + getSentenceEnd(after))
    .trim();
  return sentence || fallback;
}

async function getDeepSeekApiKey() {
  const stored = await chrome.storage.local.get({ deepseekApiKey: "" });
  return typeof stored.deepseekApiKey === "string" ? stored.deepseekApiKey : "";
}

function renderLlmPrompt(area) {
  area.replaceChildren();
  const prompt = document.createElement("p");
  prompt.className = "nbf-llm-prompt";
  prompt.textContent = "尚未配置 DeepSeek API Key";
  const goToSettings = document.createElement("button");
  goToSettings.type = "button";
  goToSettings.textContent = "前往设置";
  goToSettings.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
  area.append(prompt, goToSettings);
}

function renderLlmLoading(area) {
  area.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "nbf-llm-loading";
  loading.textContent = "翻译中…";
  area.append(loading);
}

function renderLlmResult(area, result) {
  area.replaceChildren();
  const translation = document.createElement("p");
  translation.className = "nbf-llm-translation";
  translation.textContent = result.translation;
  const explanation = document.createElement("p");
  explanation.className = "nbf-llm-explanation";
  explanation.textContent = result.explanation;
  area.append(translation, explanation);
}

function renderLlmError(area, message) {
  area.replaceChildren();
  const error = document.createElement("p");
  error.className = "nbf-llm-error";
  error.textContent = message;
  area.append(error);
}

function showWordPopover(marker, familiarWords) {
  const lemma = marker.dataset.lemma;
  if (!lemma) return;
  if (openLemma === lemma && document.querySelector(".nbf-word-popover")) return;
  document.querySelector(".nbf-word-popover")?.remove();
  openLemma = lemma;

  const popover = document.createElement("div");
  popover.className = "nbf-word-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "单词详情");

  const word = document.createElement("p");
  word.className = "nbf-popover-word";
  word.textContent = lemma;

  const definitionArea = document.createElement("div");
  definitionArea.className = "nbf-definition-area";
  const definition = renderLoadingDefinition(definitionArea);

  const llmButton = document.createElement("button");
  llmButton.type = "button";
  llmButton.className = "nbf-llm-button";
  llmButton.textContent = "专业术语翻译";

  const llmArea = document.createElement("div");
  llmArea.className = "nbf-llm-area";

  const managedAs = document.createElement("p");
  managedAs.className = "nbf-managed-as";
  managedAs.textContent = `按 ${lemma} 管理`;

  let currentDefinition = null;
  let hasLlmDefinition = false;
  let lookupState = "loading";
  let alreadyCollected = false;

  const collectButton = document.createElement("button");
  collectButton.type = "button";
  collectButton.className = "nbf-collect-button";
  const collectHint = document.createElement("p");
  collectHint.className = "nbf-collect-hint";

  function refreshCollectButton() {
    if (alreadyCollected) {
      collectButton.textContent = "已加入生词本";
      collectButton.disabled = true;
      collectButton.title = "";
      collectHint.hidden = true;
    } else if (currentDefinition) {
      collectButton.textContent = "加入生词本";
      collectButton.disabled = false;
      collectButton.title = "";
      collectHint.hidden = true;
    } else {
      collectButton.textContent = "加入生词本";
      collectButton.disabled = true;
      collectButton.title = "请先完成翻译";
      const hasNoDefinition = lookupState === "empty" || lookupState === "error";
      collectHint.textContent = "请先完成翻译";
      collectHint.hidden = !hasNoDefinition;
    }
  }

  llmButton.addEventListener("click", async () => {
    const apiKey = await getDeepSeekApiKey();
    if (!apiKey) {
      renderLlmPrompt(llmArea);
      return;
    }
    const target = lemma;
    const sentence = getContainingSentence(marker);
    const cacheKey = `${target}\n${sentence}`;
    const cached = llmResultCache.get(cacheKey);
    if (cached) {
      renderLlmResult(llmArea, cached);
      currentDefinition = cached.translation;
      hasLlmDefinition = true;
      refreshCollectButton();
      return;
    }
    renderLlmLoading(llmArea);
    try {
      const response = await chrome.runtime.sendMessage({
        type: "deepseek-translate",
        target,
        sentence,
      });
      if (!response?.ok) throw new Error(response?.error ?? "LLM 翻译失败");
      const result = {
        translation: response.translation,
        explanation: response.explanation,
      };
      llmResultCache.set(cacheKey, result);
      if (!llmArea.isConnected) return;
      renderLlmResult(llmArea, result);
      currentDefinition = result.translation;
      hasLlmDefinition = true;
      refreshCollectButton();
    } catch (error) {
      if (!llmArea.isConnected) return;
      renderLlmError(llmArea, error?.message ?? "LLM 翻译失败");
    }
  });

  collectButton.addEventListener("click", async () => {
    // 收录释义在收藏时确定：优先采用已获得的 LLM 结果，否则采用普通词典结果。
    const definition = currentDefinition;
    if (!definition) return;
    const vocabBook = await getVocabBook();
    if (vocabBook[lemma]) return;
    vocabBook[lemma] = { definition, mastered: false };
    await chrome.storage.local.set({ vocabBook });
    alreadyCollected = true;
    refreshCollectButton();
  });

  const familiarButton = document.createElement("button");
  familiarButton.type = "button";
  familiarButton.textContent = "认识";
  familiarButton.addEventListener("click", async () => {
    const stored = await chrome.storage.local.get({ familiarWords: [], vocabBook: {} });
    const nextFamiliarWords = [...new Set([...stored.familiarWords, lemma])];
    const update = { familiarWords: nextFamiliarWords };
    if (stored.vocabBook[lemma]) {
      stored.vocabBook[lemma] = { ...stored.vocabBook[lemma], mastered: true };
      update.vocabBook = stored.vocabBook;
    }
    await chrome.storage.local.set(update);
    familiarWords.add(lemma);
    for (const match of document.querySelectorAll(".nbf-potential-word")) {
      if (match.dataset.lemma === lemma) match.replaceWith(match.textContent ?? "");
    }
    closeWordPopover();
  });

  const actions = document.createElement("div");
  actions.className = "nbf-actions";
  actions.append(familiarButton, collectButton);

  refreshCollectButton();
  popover.append(word, definitionArea, llmButton, llmArea, managedAs, actions, collectHint);
  document.body.append(popover);
  positionPopover(popover, marker);

  void (async () => {
    const vocabBook = await getVocabBook();
    if (vocabBook[lemma]) {
      alreadyCollected = true;
      refreshCollectButton();
    }
    await renderDefinitionResult(definitionArea, lemma, definition, (status) => {
      if (status.state === "resolved") {
        lookupState = "resolved";
        if (!hasLlmDefinition) currentDefinition = status.definition;
      } else {
        lookupState = status.state;
      }
      refreshCollectButton();
    });
  })();
}

function cancelPopoverClose() {
  if (popoverCloseTimer) {
    clearTimeout(popoverCloseTimer);
    popoverCloseTimer = null;
  }
}

function closeWordPopover() {
  document.querySelector(".nbf-word-popover")?.remove();
  openLemma = null;
}

function schedulePopoverClose() {
  cancelPopoverClose();
  popoverCloseTimer = setTimeout(() => {
    popoverCloseTimer = null;
    closeWordPopover();
  }, 250);
}

function listenForWordInteractions(familiarWords) {
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    cancelPopoverClose();
    closeWordPopover();
  });

  document.addEventListener("mouseover", (event) => {
    const target = event.target;
    if (target.closest?.(".nbf-word-popover")) {
      cancelPopoverClose();
      return;
    }
    const marker = target.closest?.(".nbf-potential-word");
    if (marker) {
      cancelPopoverClose();
      showWordPopover(marker, familiarWords);
    }
  });

  document.addEventListener("mouseout", (event) => {
    const target = event.target;
    if (target.closest?.(".nbf-potential-word") || target.closest?.(".nbf-word-popover")) {
      schedulePopoverClose();
    }
  });

  document.addEventListener("click", (event) => {
    const marker = event.target.closest?.(".nbf-potential-word");
    if (marker) showWordPopover(marker, familiarWords);
  });
}

async function highlightPotentialWordsOnEnabledSite() {
  const { enabledHosts } = await chrome.storage.local.get({ enabledHosts: [] });
  if (!enabledHosts.includes(location.hostname.toLowerCase())) return;

  const bundledWords = await loadBundledWordList();
  const lexicon = new Set(bundledWords);
  const storedFamiliarWords = await getFamiliarWords(bundledWords);
  const familiarWords = new Set(
    [...storedFamiliarWords].map((word) => getLemma(word, lexicon)),
  );
  await chrome.storage.local.set({ familiarWords: [...familiarWords] });
  highlightPotentialWordsIn(document.body, familiarWords, lexicon);
  observeDynamicText(familiarWords, lexicon);
  listenForWordInteractions(familiarWords);
}

void highlightPotentialWordsOnEnabledSite();
