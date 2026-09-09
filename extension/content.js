const EXCLUDED_SELECTOR =
  "code, pre, script, style, input, textarea, noscript, [hidden], .nbf-potential-word";

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

function highlightTextNode(textNode, familiarWords) {
  const source = textNode.nodeValue ?? "";
  const wordPattern = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
  const fragment = document.createDocumentFragment();
  const ignoredRanges = getIgnoredRanges(source);
  let cursor = 0;
  let hasPotentialWord = false;

  for (const match of source.matchAll(wordPattern)) {
    const word = match[0];
    const index = match.index ?? 0;
    fragment.append(source.slice(cursor, index));

    const isIgnored = ignoredRanges.some(
      (range) => index >= range.start && index < range.end,
    );
    if (isIgnored || familiarWords.has(word.toLowerCase())) {
      fragment.append(word);
    } else {
      const marker = document.createElement("span");
      marker.className = "nbf-potential-word";
      marker.textContent = word;
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

function highlightPotentialWordsIn(root, familiarWords) {
  for (const textNode of getScannableTextNodes(root)) {
    highlightTextNode(textNode, familiarWords);
  }
}

function observeDynamicText(familiarWords) {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        highlightPotentialWordsIn(mutation.target, familiarWords);
        continue;
      }
      for (const node of mutation.addedNodes) {
        highlightPotentialWordsIn(node, familiarWords);
      }
    }
  });
  observer.observe(document.body, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}

async function loadInitialFamiliarWords() {
  const response = await fetch(chrome.runtime.getURL("google-10000-english.txt"));
  if (!response.ok) throw new Error("无法加载初始熟词表");
  return (await response.text())
    .split(/\r?\n/u)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 1500);
}

async function getFamiliarWords() {
  const stored = await chrome.storage.local.get({
    familiarWordsInitialized: false,
    familiarWords: [],
  });
  if (stored.familiarWordsInitialized) return new Set(stored.familiarWords);

  const familiarWords = await loadInitialFamiliarWords();
  await chrome.storage.local.set({
    familiarWords,
    familiarWordsInitialized: true,
  });
  return new Set(familiarWords);
}

async function highlightPotentialWordsOnEnabledSite() {
  const { enabledHosts } = await chrome.storage.local.get({ enabledHosts: [] });
  if (!enabledHosts.includes(location.hostname.toLowerCase())) return;

  const familiarWords = await getFamiliarWords();
  highlightPotentialWordsIn(document.body, familiarWords);
  observeDynamicText(familiarWords);
}

void highlightPotentialWordsOnEnabledSite();
