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

function highlightTextNode(textNode, familiarWords) {
  const source = textNode.nodeValue ?? "";
  const wordPattern = /[A-Za-z]+(?:'[A-Za-z]+)*/g;
  const fragment = document.createDocumentFragment();
  let cursor = 0;
  let hasPotentialWord = false;

  for (const match of source.matchAll(wordPattern)) {
    const word = match[0];
    const index = match.index ?? 0;
    fragment.append(source.slice(cursor, index));

    if (familiarWords.has(word.toLowerCase())) {
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
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) {
    if (shouldScan(walker.currentNode)) textNodes.push(walker.currentNode);
  }
  for (const textNode of textNodes) highlightTextNode(textNode, familiarWords);
}

void highlightPotentialWordsOnEnabledSite();
