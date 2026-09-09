chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get("enabledHosts");
  if (!Array.isArray(stored.enabledHosts)) {
    await chrome.storage.local.set({ enabledHosts: [] });
  }
});
