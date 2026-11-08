import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { unzipSync } from "fflate";
const suppliedDirectory = process.argv[2];
const serverPort = process.argv[3] || "3100";
let running = false;
try {
  await fetch(`http://127.0.0.1:${serverPort}/api/config`, {
    signal: AbortSignal.timeout(1000),
  });
  running = true;
} catch {
  /* Expected: Playwright's test server is stopped. */
}
assert.equal(
  running,
  false,
  `Stop the backend on port ${serverPort} before this check.`,
);
let exportDirectory: string;
let htmlFile = "portable-notes.html";
if (suppliedDirectory) {
  exportDirectory = path.resolve(suppliedDirectory);
  htmlFile = "notes.html";
  const archive = unzipSync(
    fs.readFileSync(path.join(exportDirectory, "evidence.zip")),
  );
  fs.mkdirSync(path.join(exportDirectory, "evidence"), { recursive: true });
  for (const [name, bytes] of Object.entries(archive)) {
    assert.ok(
      [
        "index.html",
        "manifest.json",
        "audio.mp3",
        "audio.wav",
        "README.txt",
      ].includes(name),
      "Unexpected archive path",
    );
    fs.writeFileSync(path.join(exportDirectory, "evidence", name), bytes);
  }
} else {
  const folders = fs
    .readdirSync("test-results")
    .filter((v) => v.startsWith("workflow-demo"));
  const folder = folders.find((v) =>
    fs.existsSync(path.join("test-results", v, htmlFile)),
  );
  assert.ok(folder, "Run npm run test:e2e first.");
  exportDirectory = path.resolve("test-results", folder);
}
const browser = await chromium.launch({ channel: "chrome" });
try {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  const requests: string[] = [];
  page.on("request", (r) => {
    if (r.url().startsWith("http")) requests.push(r.url());
  });
  for (const file of [htmlFile, "evidence/index.html"]) {
    await page.goto("file://" + path.resolve(exportDirectory, file));
    assert.ok(await page.locator("h1").textContent());
    assert.ok(
      await page
        .locator("img")
        .evaluateAll(
          (imgs) =>
            imgs.length > 0 &&
            imgs.every((i) => (i as HTMLImageElement).naturalWidth > 0),
        ),
    );
    assert.equal(
      await page
        .locator('a[href^="#"]')
        .evaluateAll((links) =>
          links.every((a) =>
            document.getElementById(a.getAttribute("href")!.slice(1)),
          ),
        ),
      true,
    );
    if (file.includes("evidence")) {
      await page.locator("audio").evaluate(async (a: HTMLAudioElement) => {
        if (a.readyState === 0)
          await new Promise<void>((resolve, reject) => {
            a.onloadedmetadata = () => resolve();
            a.onerror = () => reject(new Error("Local audio failed"));
          });
        await a.play();
      });
      assert.ok(
        await page
          .locator("audio")
          .evaluate((a: HTMLAudioElement) => !a.paused && a.duration > 0),
      );
    }
  }
  assert.deepEqual(requests, []);
  console.log(
    "PASS: backend stopped, network offline, HTML images and anchors resolve; extracted ZIP audio plays via file://.",
  );
} finally {
  await browser.close();
}
