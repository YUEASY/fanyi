import { test as base, chromium, expect, type BrowserContext, type Page } from "@playwright/test";
import { createServer, type Server } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

async function launchExtension(userDataDir: string) {
  const extensionPath = path.join(process.cwd(), "extension");
  return chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
    ],
  });
}

const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
  userDataDir: string;
}>({
  userDataDir: async ({}, use) => {
    const directory = await mkdtemp(path.join(tmpdir(), "niubifanyi-e2e-"));
    await use(directory);
    await rm(directory, { recursive: true, force: true });
  },
  context: async ({ userDataDir }, use) => {
    const context = await launchExtension(userDataDir);
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent("serviceworker");
    await use(new URL(worker.url()).host);
  },
});

let server: Server;
let port: number;
let onlineDictionaryCalls: string[] = [];
let onlineDictionaryStatus = 200;
let onlineDictionaryDefinitions: Record<string, string> = {};

test.beforeEach(() => {
  onlineDictionaryCalls = [];
  onlineDictionaryStatus = 200;
  onlineDictionaryDefinitions = {};
});

test.beforeAll(async () => {
  server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://docs.localhost");
    if (url.pathname === "/dictionary") {
      const word = url.searchParams.get("q") ?? "";
      onlineDictionaryCalls.push(word);
      const status = onlineDictionaryStatus;
      if (status !== 200) {
        response.statusCode = status;
        response.setHeader("content-type", "application/json; charset=utf-8");
        response.end(JSON.stringify({ error: `HTTP ${status}` }));
        return;
      }
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(
        JSON.stringify({
          responseData: { translatedText: onlineDictionaryDefinitions[word] ?? "" },
          responseStatus: 200,
        }),
      );
      return;
    }
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body>
      <main>
        <p id="static-copy">Quizzacious Quizzacious HTTP DeepSeek</p>
        <p id="word-forms">Working worked works</p>
        <p id="ambiguous-forms">Use uses News new Do does Doe Go went Man men Woman women Foot feet</p>
        <p id="identifiers">12345 https://example.com/quizzacious useState foo_bar user123</p>
        <div id="dynamic-copy"></div>
        <p id="dynamic-update">the</p>
      </main>
      <code>Codeword should remain untouched.</code>
      <pre>Infrastructure should remain untouched.</pre>
      <script>const Scriptword = true;</script>
      <style>.Styleword { color: red; }</style>
      <input value="Inputword" />
      <textarea>Textareaword</textarea>
      <p hidden>Invisible vocabulary stays hidden.</p>
      <p style="opacity: 0">Transparent vocabulary stays hidden.</p>
      <p style="display: none">Collapsed vocabulary stays hidden.</p>
      <p style="visibility: hidden">Concealed vocabulary stays hidden.</p>
    </body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not bind");
  port = address.port;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

type DictionaryConfig = {
  localDictionary?: Record<string, string> | null;
  onlineDictionaryUrl?: string;
};

type VocabBook = Record<string, { definition: string; mastered: boolean }>;

async function readStorage(options: Page) {
  return options.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { storage: { local: { get(): Promise<Record<string, unknown>> } } };
    };
    return extensionGlobal.chrome.storage.local.get();
  });
}

async function enableDocsHostAndOpenPage(
  context: BrowserContext,
  extensionId: string,
  dictionaryConfig: DictionaryConfig = {},
) {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("页面网址").fill(`http://docs.localhost:${port}/guide`);
  await options.getByRole("button", { name: "启用网站" }).click();
  await options.evaluate(
    async (config) => {
      const extensionGlobal = globalThis as typeof globalThis & {
        chrome: { storage: { local: { set(value: Record<string, unknown>): Promise<void> } } };
      };
      const update: Record<string, unknown> = {
        onlineDictionaryUrl: config.onlineDictionaryUrl,
      };
      if (config.localDictionary) update.localDictionary = config.localDictionary;
      await extensionGlobal.chrome.storage.local.set(update);
    },
    {
      onlineDictionaryUrl:
        dictionaryConfig.onlineDictionaryUrl ?? `http://docs.localhost:${port}/dictionary`,
      localDictionary: dictionaryConfig.localDictionary ?? null,
    },
  );
  const page = await context.newPage();
  await page.goto(`http://docs.localhost:${port}/guide`);
  return { options, page };
}

test("enables only the entered full hostname and keeps it after reload", async ({
  context,
  extensionId,
  userDataDir,
}) => {
  const options = await context.newPage();
  await options.goto(`chrome-extension://${extensionId}/options.html`);
  await options.getByLabel("页面网址").fill(`http://docs.localhost:${port}/guide`);
  await options.getByRole("button", { name: "启用网站" }).click();
  await expect(options.getByText("docs.localhost", { exact: true })).toBeVisible();

  const enabled = await context.newPage();
  await enabled.goto(`http://docs.localhost:${port}/guide`);
  await expect(enabled.locator(".nbf-potential-word")).not.toHaveCount(0);
  await expect(enabled.locator(".nbf-potential-word").first()).toHaveCSS(
    "text-decoration-color",
    "rgb(230, 200, 79)",
  );
  await expect(enabled.locator("pre .nbf-potential-word")).toHaveCount(0);
  await expect(enabled.locator("code .nbf-potential-word")).toHaveCount(0);
  await expect(enabled.locator("script .nbf-potential-word")).toHaveCount(0);
  await expect(enabled.locator("style .nbf-potential-word")).toHaveCount(0);
  await expect(enabled.locator("input .nbf-potential-word")).toHaveCount(0);
  await expect(enabled.locator("textarea .nbf-potential-word")).toHaveCount(0);
  await expect(enabled.locator("[hidden] .nbf-potential-word")).toHaveCount(0);
  await expect(enabled.locator('[style="opacity: 0"] .nbf-potential-word')).toHaveCount(0);
  await expect(enabled.locator('[style="display: none"] .nbf-potential-word')).toHaveCount(0);
  await expect(enabled.locator('[style="visibility: hidden"] .nbf-potential-word')).toHaveCount(0);

  await expect(
    enabled.locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" }),
  ).toHaveCount(2);
  await expect(enabled.locator("#static-copy .nbf-potential-word", { hasText: "HTTP" })).toHaveCount(1);
  await expect(
    enabled.locator("#static-copy .nbf-potential-word", { hasText: "DeepSeek" }),
  ).toHaveCount(1);
  await expect(enabled.locator("#identifiers .nbf-potential-word")).toHaveCount(0);

  await enabled.locator("#dynamic-copy").evaluate((element) => {
    element.textContent = "Dynamically Quizzacious";
  });
  await expect(
    enabled.locator("#dynamic-copy .nbf-potential-word", { hasText: "Dynamically" }),
  ).toHaveCount(1);
  await enabled.locator("#dynamic-update").evaluate((element) => {
    if (!element.firstChild) throw new Error("dynamic update fixture has no text node");
    element.firstChild.nodeValue = "Quizzacious";
  });
  await expect(enabled.locator("#dynamic-update .nbf-potential-word")).toHaveText(
    "Quizzacious",
  );

  const storage = await options.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { storage: { local: { get(): Promise<Record<string, unknown>> } } };
    };
    return extensionGlobal.chrome.storage.local.get();
  });
  expect(storage).not.toHaveProperty("potentialWords");
  const familiarWords = storage.familiarWords as string[];
  expect(new Set(familiarWords).size).toBe(familiarWords.length);

  await enabled.reload();
  await expect(enabled.locator(".nbf-potential-word")).not.toHaveCount(0);

  const parent = await context.newPage();
  await parent.goto(`http://localhost:${port}/guide`);
  await expect(parent.locator(".nbf-potential-word")).toHaveCount(0);

  const sibling = await context.newPage();
  await sibling.goto(`http://api.localhost:${port}/guide`);
  await expect(sibling.locator(".nbf-potential-word")).toHaveCount(0);

  await context.close();
  const reloadedContext = await launchExtension(userDataDir);
  const reloadedOptions = await reloadedContext.newPage();
  await reloadedOptions.goto(`chrome-extension://${extensionId}/options.html`);
  await expect(reloadedOptions.getByText("docs.localhost", { exact: true })).toBeVisible();
  await reloadedContext.close();
});

test("initializes familiar words once and does not restore a removed seed word", async ({
  context,
  extensionId,
  userDataDir,
}) => {
  const { options, page } = await enableDocsHostAndOpenPage(context, extensionId);
  await expect(page.locator(".nbf-potential-word")).not.toHaveCount(0);
  await expect(page.locator("#dynamic-update .nbf-potential-word")).toHaveCount(0);

  const initialized = await options.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { storage: { local: { get(): Promise<Record<string, unknown>> } } };
    };
    const storage = await extensionGlobal.chrome.storage.local.get();
    const familiarWords = storage.familiarWords as string[];
    const initialFamiliarWords = storage.initialFamiliarWords as string[];
    return {
      initialCount: initialFamiliarWords.length,
      initialized: storage.familiarWordsInitialized,
      containsThe: familiarWords.includes("the"),
    };
  });
  expect(initialized).toEqual({ initialCount: 1500, initialized: true, containsThe: true });
  await options.reload();
  await options.getByLabel("搜索熟词").fill("the");
  const familiarList = options.getByRole("list", { name: "熟词表" });
  await expect(familiarList.getByText("the", { exact: true })).toBeVisible();
  await familiarList.getByRole("button", { name: "移除 the", exact: true }).click();
  await expect(familiarList.getByText("the", { exact: true })).toHaveCount(0);

  await context.close();
  const reloadedContext = await launchExtension(userDataDir);
  const reloadedPage = await reloadedContext.newPage();
  await reloadedPage.goto(`http://docs.localhost:${port}/guide`);
  await expect(
    reloadedPage.locator("#dynamic-update .nbf-potential-word", { hasText: "the" }),
  ).toHaveCount(1);
  await reloadedContext.close();
});

test("marks a reliable lemma as familiar from its word popover", async ({
  context,
  extensionId,
}) => {
  const { options, page } = await enableDocsHostAndOpenPage(context, extensionId);
  await expect(page.locator(".nbf-potential-word")).not.toHaveCount(0);
  await options.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { storage: { local: {
        get(key: string): Promise<Record<string, unknown>>;
        set(value: Record<string, unknown>): Promise<void>;
      } } };
    };
    const storage = await extensionGlobal.chrome.storage.local.get("familiarWords");
    const workForms = new Set([
      "work", "working", "worked", "works",
      "use", "uses", "used", "using", "us", "news", "new",
      "do", "does", "did", "doing", "doe",
      "go", "went", "gone", "man", "men", "woman", "women", "foot", "feet",
    ]);
    await extensionGlobal.chrome.storage.local.set({
      familiarWords: (storage.familiarWords as string[]).filter((word) => !workForms.has(word)),
    });
  });
  await page.reload();

  const forms = page.locator("#word-forms .nbf-potential-word");
  await expect(forms).toHaveCount(3);
  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .click();
  await expect(page.getByRole("dialog", { name: "单词详情" })).toContainText(
    "按 quizzacious 管理",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "单词详情" })).toHaveCount(0);
  await forms.filter({ hasText: "Working" }).click();
  const popover = page.getByRole("dialog", { name: "单词详情" });
  await expect(popover).toContainText("按 work 管理");
  const familiarButton = popover.getByRole("button", { name: "认识" });
  await expect(familiarButton).toBeEnabled();
  await familiarButton.click();

  await expect(forms).toHaveCount(0);
  await page.reload();
  await expect(page.locator("#word-forms .nbf-potential-word")).toHaveCount(0);

  await page.locator("#ambiguous-forms .nbf-potential-word", { hasText: "uses" }).click();
  await expect(page.getByRole("dialog", { name: "单词详情" })).toContainText("按 use 管理");
  await page.locator("#ambiguous-forms .nbf-potential-word", { hasText: "News" }).click();
  await expect(page.getByRole("dialog", { name: "单词详情" })).toContainText("按 news 管理");
  await page.locator("#ambiguous-forms .nbf-potential-word", { hasText: "does" }).click();
  await expect(page.getByRole("dialog", { name: "单词详情" })).toContainText("按 do 管理");
  for (const [form, lemma] of [["went", "go"], ["men", "man"], ["women", "woman"], ["feet", "foot"]]) {
    await page.locator("#ambiguous-forms").getByText(form, { exact: true }).click();
    await expect(page.getByRole("dialog", { name: "单词详情" })).toContainText(`按 ${lemma} 管理`);
  }
});

test("hovers a potential word to show a local definition without writing data or calling online", async ({
  context,
  extensionId,
}) => {
  const { options, page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: { quizzacious: "古怪的" },
  });
  await expect(page.locator(".nbf-potential-word")).not.toHaveCount(0);
  const storageBefore = await readStorage(options);

  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  const dialog = page.getByRole("dialog", { name: "单词详情" });
  await expect(dialog).toContainText("古怪的");
  await expect(dialog).toContainText("按 quizzacious 管理");
  expect(onlineDictionaryCalls).toEqual([]);
  expect(await readStorage(options)).toEqual(storageBefore);
});

test("falls back to the online dictionary when the local dictionary misses", async ({
  context,
  extensionId,
}) => {
  onlineDictionaryDefinitions = { quizzacious: "古怪的（在线）" };
  const { page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: {},
  });
  await expect(page.locator(".nbf-potential-word")).not.toHaveCount(0);

  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  await expect(page.getByRole("dialog", { name: "单词详情" })).toContainText(
    "古怪的（在线）",
  );
  expect(onlineDictionaryCalls).toEqual(["quizzacious"]);
});

test("shows 未找到释义 when neither dictionary has the word", async ({
  context,
  extensionId,
}) => {
  const { page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: {},
  });
  await expect(page.locator(".nbf-potential-word")).not.toHaveCount(0);

  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  await expect(page.getByRole("dialog", { name: "单词详情" })).toContainText("未找到释义");
  expect(onlineDictionaryCalls).toEqual(["quizzacious"]);
});

test("shows a clear service failure and retries only when the user clicks retry", async ({
  context,
  extensionId,
}) => {
  onlineDictionaryStatus = 500;
  const { page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: {},
  });
  await expect(page.locator(".nbf-potential-word")).not.toHaveCount(0);

  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  const dialog = page.getByRole("dialog", { name: "单词详情" });
  await expect(dialog).toContainText("在线词典返回 HTTP 500");
  const retry = dialog.getByRole("button", { name: "重试" });
  await expect(retry).toBeVisible();
  expect(onlineDictionaryCalls).toEqual(["quizzacious"]);

  await page.waitForTimeout(500);
  expect(onlineDictionaryCalls).toEqual(["quizzacious"]);

  onlineDictionaryStatus = 200;
  onlineDictionaryDefinitions = { quizzacious: "古怪的（重试成功）" };
  await retry.click();
  await expect(dialog).toContainText("古怪的（重试成功）");
  expect(onlineDictionaryCalls).toEqual(["quizzacious", "quizzacious"]);
});

test("shows a clear network failure and still offers retry", async ({ context, extensionId }) => {
  const { page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: {},
    onlineDictionaryUrl: "http://network-error.invalid/dictionary",
  });
  await expect(page.locator(".nbf-potential-word")).not.toHaveCount(0);

  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  const dialog = page.getByRole("dialog", { name: "单词详情" });
  await expect(dialog).toContainText("网络错误，请检查网络连接");
  const retry = dialog.getByRole("button", { name: "重试" });
  await expect(retry).toBeVisible();

  await retry.click();
  await expect(dialog).toContainText("网络错误，请检查网络连接");
});

test("collects a word with a valid definition into the vocab book under its lemma", async ({
  context,
  extensionId,
}) => {
  const { options, page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: { quizzacious: "古怪的" },
  });
  await expect(page.locator(".nbf-potential-word")).not.toHaveCount(0);

  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  const dialog = page.getByRole("dialog", { name: "单词详情" });
  await expect(dialog).toContainText("古怪的");
  const collectButton = dialog.getByRole("button", { name: "加入生词本" });
  await expect(collectButton).toBeEnabled();
  await collectButton.click();
  await expect(dialog.getByRole("button", { name: "已加入生词本" })).toBeDisabled();

  const storage = await readStorage(options);
  const vocabBook = storage.vocabBook as VocabBook;
  expect(vocabBook).toEqual({ quizzacious: { definition: "古怪的", mastered: false } });
});

test("disables the collect button and prompts 请先完成翻译 without a definition", async ({
  context,
  extensionId,
}) => {
  const { options, page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: {},
  });
  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  const dialog = page.getByRole("dialog", { name: "单词详情" });
  await expect(dialog).toContainText("未找到释义");
  const collectButton = dialog.getByRole("button", { name: "加入生词本" });
  await expect(collectButton).toBeDisabled();
  await expect(dialog.getByText("请先完成翻译")).toBeVisible();

  const storage = await readStorage(options);
  expect(storage).not.toHaveProperty("vocabBook");
});

test("prompts 请先完成翻译 when the definition lookup fails", async ({
  context,
  extensionId,
}) => {
  const { page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: {},
    onlineDictionaryUrl: "http://network-error.invalid/dictionary",
  });
  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  const dialog = page.getByRole("dialog", { name: "单词详情" });
  await expect(dialog).toContainText("网络错误，请检查网络连接");
  await expect(dialog.getByRole("button", { name: "加入生词本" })).toBeDisabled();
  await expect(dialog.getByText("请先完成翻译")).toBeVisible();
});

test("stores different word forms as a single vocab book entry by lemma", async ({
  context,
  extensionId,
}) => {
  const { options, page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: { work: "工作" },
  });
  await options.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { storage: { local: {
        get(key: string): Promise<Record<string, unknown>>;
        set(value: Record<string, unknown>): Promise<void>;
      } } };
    };
    const storage = await extensionGlobal.chrome.storage.local.get("familiarWords");
    const workForms = new Set(["work", "working", "worked", "works"]);
    await extensionGlobal.chrome.storage.local.set({
      familiarWords: (storage.familiarWords as string[]).filter((word) => !workForms.has(word)),
    });
  });
  await page.reload();
  await expect(page.locator("#word-forms .nbf-potential-word")).toHaveCount(3);

  await page.locator("#word-forms .nbf-potential-word", { hasText: "Working" }).click();
  const dialog = page.getByRole("dialog", { name: "单词详情" });
  await expect(dialog).toContainText("按 work 管理");
  await expect(dialog).toContainText("工作");
  await dialog.getByRole("button", { name: "加入生词本" }).click();

  const storage = await readStorage(options);
  const vocabBook = storage.vocabBook as VocabBook;
  expect(vocabBook).toEqual({ work: { definition: "工作", mastered: false } });

  await page.keyboard.press("Escape");
  await page.locator("#word-forms .nbf-potential-word", { hasText: "worked" }).click();
  await expect(page.getByRole("dialog", { name: "单词详情" })).toContainText("按 work 管理");
  await expect(
    page.getByRole("dialog", { name: "单词详情" }).getByRole("button", { name: "已加入生词本" }),
  ).toBeDisabled();
});

test("does not duplicate or overwrite a collected definition when re-encountered", async ({
  context,
  extensionId,
}) => {
  const { options, page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: { quizzacious: "古怪的" },
  });
  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  await page
    .getByRole("dialog", { name: "单词详情" })
    .getByRole("button", { name: "加入生词本" })
    .click();

  await options.evaluate(async () => {
    const extensionGlobal = globalThis as typeof globalThis & {
      chrome: { storage: { local: { set(value: Record<string, unknown>): Promise<void> } } };
    };
    await extensionGlobal.chrome.storage.local.set({
      localDictionary: { quizzacious: "完全不同的释义" },
    });
  });

  await page.keyboard.press("Escape");
  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .hover();
  await expect(
    page.getByRole("dialog", { name: "单词详情" }).getByRole("button", { name: "已加入生词本" }),
  ).toBeDisabled();

  const storage = await readStorage(options);
  const vocabBook = storage.vocabBook as VocabBook;
  expect(vocabBook).toEqual({ quizzacious: { definition: "古怪的", mastered: false } });
});

test("marking a word familiar does not create a vocab book entry", async ({
  context,
  extensionId,
}) => {
  const { options, page } = await enableDocsHostAndOpenPage(context, extensionId, {
    localDictionary: { quizzacious: "古怪的" },
  });
  await page
    .locator("#static-copy .nbf-potential-word", { hasText: "Quizzacious" })
    .first()
    .click();
  await page
    .getByRole("dialog", { name: "单词详情" })
    .getByRole("button", { name: "认识" })
    .click();

  const storage = await readStorage(options);
  expect(storage).not.toHaveProperty("vocabBook");
});
