const EXCLUDED_SELECTOR =
  "code, pre, script, style, input, textarea, noscript, [hidden], .nbf-potential-word, .nbf-word-popover";

function getLemma(word, lexicon) {
  const lowerWord = word.toLowerCase();
  const candidates = new Set();
  const addCandidate = (candidate) => {
    if (candidate !== lowerWord && lexicon.has(candidate)) candidates.add(candidate);
  };

  if (lowerWord.endsWith("ies") && lowerWord.length > 3) {
    addCandidate(`${lowerWord.slice(0, -3)}y`);
  } else if (lowerWord.endsWith("es") && lowerWord.length > 2) {
    addCandidate(lowerWord.slice(0, -2));
    addCandidate(lowerWord.slice(0, -1));
  } else if (lowerWord.endsWith("s") && !lowerWord.endsWith("ss")) {
    addCandidate(lowerWord.slice(0, -1));
  }

  for (const suffix of ["ing", "ed"]) {
    if (!lowerWord.endsWith(suffix) || lowerWord.length <= suffix.length) continue;
    const stem = lowerWord.slice(0, -suffix.length);
    addCandidate(stem);
    addCandidate(`${stem}e`);
    if (stem.length > 2 && stem.at(-1) === stem.at(-2)) addCandidate(stem.slice(0, -1));
  }

  return candidates.size === 1 ? candidates.values().next().value : lowerWord;
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

async function loadProjectWords() {
  const response = await fetch(chrome.runtime.getURL("google-10000-english.txt"));
  if (!response.ok) throw new Error("无法加载初始熟词表");
  return (await response.text())
    .split(/\r?\n/u)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
}

async function getFamiliarWords(projectWords) {
  const stored = await chrome.storage.local.get({
    familiarWordsInitialized: false,
    familiarWords: [],
  });
  if (stored.familiarWordsInitialized) return new Set(stored.familiarWords);

  const familiarWords = projectWords.slice(0, 1500);
  await chrome.storage.local.set({
    familiarWords,
    familiarWordsInitialized: true,
  });
  return new Set(familiarWords);
}

function showWordPopover(marker, familiarWords) {
  document.querySelector(".nbf-word-popover")?.remove();
  const lemma = marker.dataset.lemma;
  if (!lemma) return;

  const popover = document.createElement("div");
  popover.className = "nbf-word-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "单词详情");

  const managedAs = document.createElement("p");
  managedAs.textContent = `按 ${lemma} 管理`;
  const familiarButton = document.createElement("button");
  familiarButton.type = "button";
  familiarButton.textContent = "认识";
  familiarButton.addEventListener("click", async () => {
    const stored = await chrome.storage.local.get({ familiarWords: [] });
    const nextFamiliarWords = [...new Set([...stored.familiarWords, lemma])];
    await chrome.storage.local.set({ familiarWords: nextFamiliarWords });
    familiarWords.add(lemma);
    for (const match of document.querySelectorAll(".nbf-potential-word")) {
      if (match.dataset.lemma === lemma) match.replaceWith(match.textContent ?? "");
    }
    popover.remove();
  });
  popover.append(managedAs, familiarButton);
  document.body.append(popover);
}

function listenForWordClicks(familiarWords) {
  document.addEventListener("click", (event) => {
    const marker = event.target.closest?.(".nbf-potential-word");
    if (marker) showWordPopover(marker, familiarWords);
  });
}

async function highlightPotentialWordsOnEnabledSite() {
  const { enabledHosts } = await chrome.storage.local.get({ enabledHosts: [] });
  if (!enabledHosts.includes(location.hostname.toLowerCase())) return;

  const projectWords = await loadProjectWords();
  const lexicon = new Set(projectWords);
  const storedFamiliarWords = await getFamiliarWords(projectWords);
  const familiarWords = new Set(
    [...storedFamiliarWords].map((word) => getLemma(word, lexicon)),
  );
  highlightPotentialWordsIn(document.body, familiarWords, lexicon);
  observeDynamicText(familiarWords, lexicon);
  listenForWordClicks(familiarWords);
}

void highlightPotentialWordsOnEnabledSite();
