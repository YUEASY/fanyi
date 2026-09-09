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

  const bundledWords = await loadBundledWordList();
  const lexicon = new Set(bundledWords);
  const storedFamiliarWords = await getFamiliarWords(bundledWords);
  const familiarWords = new Set(
    [...storedFamiliarWords].map((word) => getLemma(word, lexicon)),
  );
  await chrome.storage.local.set({ familiarWords: [...familiarWords] });
  highlightPotentialWordsIn(document.body, familiarWords, lexicon);
  observeDynamicText(familiarWords, lexicon);
  listenForWordClicks(familiarWords);
}

void highlightPotentialWordsOnEnabledSite();
