import { test, expect } from "@playwright/test";

test.use({
  launchOptions: {
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
    ],
  },
  permissions: ["microphone"],
});
async function newSession(
  page: import("@playwright/test").Page,
  request: import("@playwright/test").APIRequestContext,
  title: string,
) {
  await page.goto("/");
  const config = await (await request.get("/api/config")).json();
  const s = await (
    await request.post("/api/sessions", {
      headers: { "X-TalkWeave-Token": config.token },
      data: { title },
    })
  ).json();
  await page.reload();
  await page.getByLabel("Search sessions").fill(title);
  await page.locator(".library-card").click();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  return { s, headers: { "X-TalkWeave-Token": config.token } };
}
async function chunkCount(page: import("@playwright/test").Page) {
  return page
    .locator(".recording-storage")
    .textContent()
    .then((text) => Number(text?.match(/(\d+) chunks/)?.[1] || 0));
}

test("device microphone records, pauses, survives offline upload failure, and enters the existing audio pipeline", async ({
  page,
  request,
  context,
}, testInfo) => {
  const { s, headers } = await newSession(
    page,
    request,
    `Capture test ${Date.now()}`,
  );
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.locator(".recording-status")).toHaveText("Recording");
  await expect(
    page.getByRole("button", { name: "New session", exact: true }),
  ).toBeDisabled();
  await expect.poll(() => chunkCount(page)).toBeGreaterThanOrEqual(2);
  await expect
    .poll(() => page.getByRole("meter").getAttribute("aria-valuenow"))
    .not.toBe("0");
  await page
    .getByRole("button", { name: "Pause recording", exact: true })
    .click();
  await expect(page.locator(".recording-status")).toHaveText("Paused");
  const pausedClock = await page.locator(".recording-clock").textContent();
  // A deliberate wall-clock gap is the behavior under test, not a processing wait.
  await page.waitForTimeout(1200);
  expect(await page.locator(".recording-clock").textContent()).toBe(
    pausedClock,
  );
  await context.setOffline(true);
  await page
    .getByRole("button", { name: "Resume recording", exact: true })
    .click();
  await expect(page.locator(".recording-status")).toHaveText("Recording");
  await expect.poll(() => chunkCount(page)).toBeGreaterThanOrEqual(4);
  await page.screenshot({
    path: testInfo.outputPath("recording-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your recording is ready." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save to session", exact: true })
    .click();
  await expect(page.locator(".recorder-message")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download audio" }),
  ).toBeVisible();
  await context.setOffline(false);
  // Lose the response after the server commits. Retrying must reuse that audio.
  await page.route(`**/api/sessions/${s.id}/audio`, async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Save to session", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save to session", exact: true }),
  ).toBeEnabled();
  const committed = await (await request.get(`/api/sessions/${s.id}`)).json();
  expect(committed.audio).toBeTruthy();
  await page.unroute(`**/api/sessions/${s.id}/audio`);
  await page
    .getByRole("button", { name: "Save to session", exact: true })
    .click();
  await expect(
    page.getByText("Source recording", { exact: true }),
  ).toBeVisible();
  const value = await (await request.get(`/api/sessions/${s.id}`)).json();
  expect(value.audio.sha256).toBe(committed.audio.sha256);
  expect(value.evidenceRevision).toBe(committed.evidenceRevision);
  expect(value.audio.duration).toBeGreaterThan(3);
  expect(value.capture.intervals).toHaveLength(2);
  expect(value.recordingSegments).toHaveLength(2);
  expect(
    Date.parse(value.recordingSegments[1].wallStart) -
      Date.parse(value.recordingSegments[0].wallEnd),
  ).toBeGreaterThan(1000);
  expect(value.capture.interrupted).toBe(false);
  const audio = page.locator(".audio-dock audio");
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.readyState))
    .toBeGreaterThan(0);
  await audio.evaluate((a: HTMLAudioElement) => a.play());
  await expect
    .poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime))
    .toBeGreaterThan(0);
  // Existing import/processing is the same path. Tests intentionally have no API key.
  await expect(
    page.getByRole("button", { name: "Create my notebook" }),
  ).toBeDisabled();
  expect(
    (await request.delete(`/api/sessions/${s.id}`, { headers })).ok(),
  ).toBe(true);
});

test("saved chunks recover after reload and decode as a complete ordered stream", async ({
  page,
  request,
}) => {
  const { s, headers } = await newSession(
    page,
    request,
    `Recovery test ${Date.now()}`,
  );
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect.poll(() => chunkCount(page)).toBeGreaterThanOrEqual(2);
  page.on("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await page.getByLabel("Search sessions").fill(s.title);
  await page.locator(".library-card").click();
  await expect(
    page.getByRole("heading", { name: "Your recording is ready." }),
  ).toBeVisible();
  await expect(
    page.getByText(/Recovered saved chunks after an interruption/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Save to session", exact: true })
    .click();
  await expect(
    page.getByText("Source recording", { exact: true }),
  ).toBeVisible();
  const value = await (await request.get(`/api/sessions/${s.id}`)).json();
  expect(value.audio.duration).toBeGreaterThan(1);
  expect(value.capture.interrupted).toBe(true);
  expect(value.recordingSegments).toEqual([]);
  expect(value.capture.warnings.join(" ")).toContain("manual photo alignment");
  expect(
    (await request.delete(`/api/sessions/${s.id}`, { headers })).ok(),
  ).toBe(true);
});

test("microphone denial never shows an active recording", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      throw new DOMException("Denied for test", "NotAllowedError");
    };
  });
  const { s, headers } = await newSession(
    page,
    request,
    `Denied mic test ${Date.now()}`,
  );
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(page.getByText(/Microphone access was denied/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toHaveCount(0);
  expect(
    (await request.delete(`/api/sessions/${s.id}`, { headers })).ok(),
  ).toBe(true);
});

test("microphone loss stops capture and preserves available audio", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as any).captureTestTrack = stream.getAudioTracks()[0];
      return stream;
    };
  });
  const { s, headers } = await newSession(
    page,
    request,
    `Disconnect test ${Date.now()}`,
  );
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect.poll(() => chunkCount(page)).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => {
    const track = (window as any).captureTestTrack as MediaStreamTrack;
    track.stop();
    // Track.stop does not itself emit ended; hardware removal does.
    track.dispatchEvent(new Event("ended"));
  });
  await expect(
    page.getByRole("heading", { name: "Your recording is ready." }),
  ).toBeVisible();
  await expect(
    page.getByText(/microphone disconnected|Recording ended unexpectedly/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Save to session", exact: true })
    .click();
  await expect(
    page.getByText("Source recording", { exact: true }),
  ).toBeVisible();
  const value = await (await request.get(`/api/sessions/${s.id}`)).json();
  expect(value.capture.interrupted).toBe(true);
  expect(value.recordingSegments).toEqual([]);
  expect(
    (await request.delete(`/api/sessions/${s.id}`, { headers })).ok(),
  ).toBe(true);
});

test("storage exhaustion stops recording and keeps an in-tab download", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (
      ...args: Parameters<IDBObjectStore["put"]>
    ) {
      if (this.name === "chunks") {
        this.transaction.abort();
        throw new DOMException("Storage full for test", "QuotaExceededError");
      }
      return put.apply(this, args);
    };
  });
  const { s, headers } = await newSession(
    page,
    request,
    `Storage test ${Date.now()}`,
  );
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your recording is ready." }),
  ).toBeVisible();
  await expect(page.getByText(/Browser storage could not save/)).toBeVisible();
  await expect(page.locator(".recording-status")).toHaveText(
    "Download to keep your audio",
  );
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download audio" }).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  expect(
    await page.evaluate(() =>
      document.querySelector("audio")?.src.startsWith("blob:"),
    ),
  ).toBe(true);
  expect(
    (await request.delete(`/api/sessions/${s.id}`, { headers })).ok(),
  ).toBe(true);
});

test("cancelling a permission request stops a microphone granted late", async ({
  page,
  request,
}) => {
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      (window as any).captureTestTrack = stream.getAudioTracks()[0];
      await new Promise<void>((resolve) => {
        (window as any).grantTestMic = resolve;
      });
      return stream;
    };
  });
  const { s, headers } = await newSession(
    page,
    request,
    `Cancel mic test ${Date.now()}`,
  );
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect
    .poll(() => page.evaluate(() => typeof (window as any).grantTestMic))
    .toBe("function");
  await page.getByRole("button", { name: "Cancel request" }).click();
  await page.evaluate(() => (window as any).grantTestMic());
  await expect
    .poll(() =>
      page.evaluate(() => (window as any).captureTestTrack.readyState),
    )
    .toBe("ended");
  await expect(
    page.getByRole("button", { name: "Start recording", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Stop recording", exact: true }),
  ).toHaveCount(0);
  expect(
    (await request.delete(`/api/sessions/${s.id}`, { headers })).ok(),
  ).toBe(true);
});

test("an outdated server explains attachment failure and retained audio saves after readiness returns", async ({
  page,
  request,
}) => {
  const { s, headers } = await newSession(
    page,
    request,
    `Old server test ${Date.now()}`,
  );
  await page
    .getByRole("button", { name: "Start recording", exact: true })
    .click();
  await expect.poll(() => chunkCount(page)).toBeGreaterThanOrEqual(1);
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save to session", exact: true }),
  ).toBeEnabled();
  await page.route("**/api/config", async (route) => {
    const response = await route.fetch();
    const config = await response.json();
    delete config.captureVersion;
    config.token = "stale-before-server-restart";
    await route.fulfill({ response, json: config });
  });
  let uploads = 0;
  page.on("request", (r) => {
    if (r.url().endsWith(`/sessions/${s.id}/audio`)) uploads++;
  });
  await page
    .getByRole("button", { name: "Save to session", exact: true })
    .click();
  await expect(
    page.getByText(/Your browser recording is retained/),
  ).toBeVisible();
  expect(uploads).toBe(0);
  await expect(
    page.getByRole("link", { name: "Download audio" }),
  ).toBeVisible();
  await page.unroute("**/api/config");
  await page
    .getByRole("button", { name: "Save to session", exact: true })
    .click();
  await expect(page.getByText(/Attached to this session/)).toBeVisible();
  expect(uploads).toBe(1);
  expect(
    (await request.delete(`/api/sessions/${s.id}`, { headers })).ok(),
  ).toBe(true);
});
