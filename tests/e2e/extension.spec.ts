import { test as base, chromium, expect, type BrowserContext } from "@playwright/test";
import { createServer, type Server } from "node:http";
import path from "node:path";

const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({}, use) => {
    const extensionPath = path.join(process.cwd(), "extension");
    const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      executablePath,
      headless: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });
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

test.beforeAll(async () => {
  server = createServer((_request, response) => {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(`<!doctype html><html><body>
      <main>Developers orchestrate deterministic workflows.</main>
      <pre>Infrastructure should remain untouched.</pre>
      <p hidden>Invisible vocabulary stays hidden.</p>
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

test("enables only the entered full hostname and keeps it after reload", async ({
  context,
  extensionId,
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
  await expect(enabled.locator("[hidden] .nbf-potential-word")).toHaveCount(0);

  await enabled.reload();
  await expect(enabled.locator(".nbf-potential-word")).not.toHaveCount(0);

  const parent = await context.newPage();
  await parent.goto(`http://localhost:${port}/guide`);
  await expect(parent.locator(".nbf-potential-word")).toHaveCount(0);

  const sibling = await context.newPage();
  await sibling.goto(`http://api.localhost:${port}/guide`);
  await expect(sibling.locator(".nbf-potential-word")).toHaveCount(0);

  await options.reload();
  await expect(options.getByText("docs.localhost", { exact: true })).toBeVisible();
});
