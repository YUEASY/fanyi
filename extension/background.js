chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get({
    enabledHosts: null,
    familiarWordsInitialized: false,
  });
  if (!Array.isArray(stored.enabledHosts)) {
    await chrome.storage.local.set({ enabledHosts: [] });
  }
  if (!stored.familiarWordsInitialized) {
    const response = await fetch(chrome.runtime.getURL("google-10000-english.txt"));
    if (!response.ok) throw new Error("无法加载初始熟词表");
    const familiarWords = (await response.text())
      .split(/\r?\n/u)
      .map((word) => word.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 1500);
    await chrome.storage.local.set({
      initialFamiliarWords: familiarWords,
      familiarWords,
      familiarWordsInitialized: true,
    });
  }
});
