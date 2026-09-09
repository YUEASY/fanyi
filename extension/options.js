const form = document.querySelector("#site-form");
const input = document.querySelector("#site-url");
const error = document.querySelector("#error");
const list = document.querySelector("#enabled-hosts");

async function getEnabledHosts() {
  const stored = await chrome.storage.local.get({ enabledHosts: [] });
  return stored.enabledHosts;
}

function render(hosts) {
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
    render(enabledHosts);
    form.reset();
  } catch {
    error.textContent = "请输入有效的 http 或 https 页面网址";
    error.hidden = false;
  }
});

void getEnabledHosts().then(render);
