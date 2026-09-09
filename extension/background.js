chrome.runtime.onInstalled.addListener(() => {
  void chrome.storage.local.get({ enabledHosts: [] });
});
