import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
test("demo import/review/export persists edits and renders offline without a backend", async ({
  page,
  context,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your library." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Explore the demo notebook/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Building resilient event pipelines",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Import", exact: true }).click();
  await page
    .getByRole("button", { name: "Open notebook", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Notes", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: /Photos & alignment/ }).click();
  await page.getByLabel("Photo 1 start").fill("30");
  await page.getByLabel("Photo 1 end").fill("60");
  await page.getByRole("button", { name: "Save match" }).first().click();
  await expect(
    page.getByText("Interval confirmed by attendee.").first(),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: /Building resilient event pipelines/ })
    .first()
    .click();
  await page.getByRole("tab", { name: /Photos & alignment/ }).click();
  await expect(page.getByLabel("Photo 1 start")).toHaveValue("30");
  await expect(page.getByLabel("Photo 1 end")).toHaveValue("60");
  await page.getByRole("tab", { name: "Transcript", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page
    .getByLabel("Transcript correction")
    .fill(
      "Corrected technical term: idempotency. [inaudible] <script>window.hostile=true</script>",
    );
  await page.getByRole("button", { name: "Save correction" }).click();
  await expect(
    page.getByText("Original & correction history").first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Notes", exact: true }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page
    .getByLabel("Your personal note")
    .fill("My observation: verify delivery semantics.");
  await page.getByRole("button", { name: "Save edits" }).click();
  await expect(
    page.getByText("My observation: verify delivery semantics."),
  ).toBeVisible();
  await page.getByLabel("Search notebook").fill("idempotent");
  await expect(
    page.getByRole("heading", {
      name: "At-least-once delivery, idempotent processing",
    }),
  ).toBeVisible();
  await page.getByLabel("Search notebook").fill("");
  await page.locator(".source-chips button").first().click();
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0);
  await page.locator("audio").evaluate((a: HTMLAudioElement) => {
    a.currentTime = 29.8;
  });
  await expect
    .poll(() =>
      page.locator("audio").evaluate((a: HTMLAudioElement) => a.paused),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Export", exact: true }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Portable HTML/ }).click();
  const download = await downloadPromise;
  const exportPath = testInfo.outputPath("portable-notes.html");
  await download.saveAs(exportPath);
  const manifestPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Source manifest/ }).click();
  await (await manifestPromise).saveAs(testInfo.outputPath("manifest.json"));
  // Saving generated HTML inside the repo must not hot-reload the page and
  // close this dialog before the remaining exports can be downloaded.
  await expect(page.getByRole("dialog")).toBeVisible();
  const zipDownloadPromise = page.waitForEvent("download");
  await page.getByRole("link", { name: /Evidence bundle/ }).click();
  const zipDownload = await zipDownloadPromise;
  const zipPath = testInfo.outputPath("evidence.zip");
  await zipDownload.saveAs(zipPath);
  const files = unzipSync(await fs.readFile(zipPath));
  const bundlePath = testInfo.outputPath("evidence");
  await fs.mkdir(bundlePath, { recursive: true });
  for (const [name, bytes] of Object.entries(files))
    await fs.writeFile(path.join(bundlePath, name), bytes);
  await context.setOffline(true);
  const offline = await context.newPage();
  const requests: string[] = [];
  offline.on("request", (r) => {
    if (r.url().startsWith("http")) requests.push(r.url());
  });
  await offline.goto("file://" + exportPath);
  await expect(
    offline.getByRole("heading", {
      name: "Building resilient event pipelines",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(
    offline.getByText("My observation: verify delivery semantics."),
  ).toBeVisible();
  expect(
    await offline
      .locator("img")
      .evaluateAll((imgs) =>
        imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0),
      ),
  ).toBe(true);
  expect(await offline.locator("audio").count()).toBe(0);
  expect(await offline.evaluate(() => "hostile" in window)).toBe(false);
  expect(requests).toEqual([]);
  await offline.setViewportSize({ width: 390, height: 844 });
  expect(
    await offline.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await offline.screenshot({
    path: testInfo.outputPath("offline-mobile.png"),
    fullPage: true,
  });
  await offline.close();
  const bundle = await context.newPage();
  await bundle.goto("file://" + path.join(bundlePath, "index.html"));
  await expect
    .poll(() =>
      bundle.locator("audio").evaluate((a: HTMLAudioElement) => a.readyState),
    )
    .toBeGreaterThan(0);
  expect(
    await bundle.locator("audio").evaluate((a: HTMLAudioElement) => a.duration),
  ).toBeCloseTo(90);
  await bundle.locator("audio").evaluate((a: HTMLAudioElement) => a.play());
  await expect
    .poll(() =>
      bundle.locator("audio").evaluate((a: HTMLAudioElement) => a.currentTime),
    )
    .toBeGreaterThan(0);
  await bundle.close();
  await context.setOffline(false);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page
    .getByRole("button", { name: /Building resilient event pipelines/ })
    .first()
    .click();
  await expect
    .poll(() =>
      page
        .locator(".note-photo img")
        .evaluateAll((imgs) =>
          imgs.every((img) => (img as HTMLImageElement).naturalWidth > 0),
        ),
    )
    .toBe(true);
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("notebook-desktop-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Light appearance" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({
    path: testInfo.outputPath("notebook-desktop-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark appearance" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("notebook-mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("real session imports actual audio/photos; missing credentials and unsafe requests are explicit", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const c = await (await request.get("/api/config")).json();
  expect(c.configured).toBe(false);
  const headers = { "X-TalkWeave-Token": c.token };
  const created = await (
    await request.post("/api/sessions", {
      headers,
      data: { title: "Import integration fixture" },
    })
  ).json();
  const wav = Buffer.alloc(44 + 32000);
  wav.write("RIFF");
  wav.writeUInt32LE(wav.length - 8, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(16000, 24);
  wav.writeUInt32LE(32000, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(32000, 40);
  const imported = await request.post(`/api/sessions/${created.id}/audio`, {
    headers,
    multipart: {
      audio: { name: "recording.wav", mimeType: "audio/wav", buffer: wav },
    },
  });
  expect(imported.ok(), await imported.text()).toBe(true);
  const value = await imported.json();
  expect(value.audio.duration).toBeCloseTo(1);
  expect(value.recordingStart).toBeNull();
  const noKey = await request.post(`/api/sessions/${created.id}/process`, {
    headers,
    data: { stage: "all" },
  });
  expect(noKey.status()).toBe(400);
  expect((await noKey.json()).error).toContain("Missing OPENAI_API_KEY");
  const unsafe = await request.post("/api/sessions", {
    data: { title: "Blocked" },
  });
  expect(unsafe.status()).toBe(403);
  const hostile = await request.get("/api/sessions", {
    headers: { Origin: "https://evil.example" },
  });
  expect(hostile.status()).toBe(403);
  const sharp = (await import("sharp")).default;
  for (const color of ["#233322", "#778866"]) {
    const photo = await sharp({
      create: { width: 100, height: 80, channels: 3, background: color },
    })
      .jpeg()
      .toBuffer();
    const response = await request.post(`/api/sessions/${created.id}/photos`, {
      headers,
      multipart: {
        photo: { name: "phone.jpg", mimeType: "image/jpeg", buffer: photo },
      },
    });
    expect(response.ok()).toBe(true);
  }
  const heic = await request.post(`/api/sessions/${created.id}/photos`, {
    headers,
    multipart: {
      photo: {
        name: "phone.heic",
        mimeType: "image/heic",
        buffer: Buffer.from("invalid"),
      },
    },
  });
  expect((await heic.json()).error).toContain("HEIC");
  await page.reload();
  await page
    .getByRole("button", { name: /Import integration fixture/ })
    .first()
    .click();
  await page.getByRole("tab", { name: "Import", exact: true }).click();
  await expect(page.getByText("2 photos safely imported.")).toBeVisible();
  await request.delete(`/api/sessions/${created.id}`, { headers });
  expect((await request.get(`/api/sessions/${created.id}`)).status()).toBe(404);
});

test("redesigned library filters, searches, and creates notebooks on mobile", async ({
  page,
  request,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your library." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Demos", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Demos", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".library-card").first()).toBeVisible();
  expect(await page.locator(".library-card .pill").allTextContents()).toEqual(
    expect.arrayContaining(["Demo fixture"]),
  );
  await page.getByLabel("Search sessions").fill("no-such-talk-239038");
  await expect(page.getByText("Nothing here just yet.")).toBeVisible();
  await page.getByRole("button", { name: "Reset filters" }).click();
  await expect(page.getByLabel("Search sessions")).toHaveValue("");
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: testInfo.outputPath("library-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Light appearance" }).click();
  await page.screenshot({
    path: testInfo.outputPath("library-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark appearance" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("library-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "New session", exact: true }).click();
  const title = `Redesign UI test ${Date.now()}`;
  await page.getByLabel("Talk title").fill(title);
  await page
    .getByRole("button", { name: "Create session", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: title, exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Import audio")).toBeAttached();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".busy-bar")).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("import-mobile.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Session settings" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.getByRole("button", { name: "Back to library" }).click();
  await page.getByLabel("Search sessions").fill(title);
  await expect(page.locator(".library-card")).toHaveCount(1);
  const config = await (await request.get("/api/config")).json();
  const sessions = await (await request.get("/api/sessions")).json();
  const created = sessions.find((s: { title: string }) => s.title === title);
  expect(
    (
      await request.delete(`/api/sessions/${created.id}`, {
        headers: { "X-TalkWeave-Token": config.token },
      })
    ).ok(),
  ).toBe(true);
});
