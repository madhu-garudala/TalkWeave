import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

test("a duplicate server exits clearly without rewriting jobs or starting HMR", async () => {
  const occupied = createServer();
  await new Promise<void>((resolve) =>
    occupied.listen(0, "127.0.0.1", resolve),
  );
  const port = (occupied.address() as { port: number }).port;
  const data = fs.mkdtempSync(path.resolve(".test-data/startup-"));
  const id = randomUUID();
  const file = path.join(data, id, "session.json");
  fs.mkdirSync(path.dirname(file));
  const original = JSON.stringify({
    id,
    job: { status: "running", stage: "notes" },
  });
  fs.writeFileSync(file, original);
  try {
    const result = await new Promise<{ code: number | null; output: string }>(
      (resolve, reject) => {
        const child = spawn(
          process.execPath,
          ["--import", "tsx", "server/index.ts"],
          {
            env: {
              ...process.env,
              PORT: String(port),
              DATA_DIR: data,
              TALKWEAVE_SKIP_ENV: "1",
              OPENAI_API_KEY: "",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let output = "";
        child.stdout.on("data", (v) => {
          output += v;
        });
        child.stderr.on("data", (v) => {
          output += v;
        });
        const timer = setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error("Duplicate server did not exit"));
        }, 15000);
        child.on("error", (error) => {
          clearTimeout(timer);
          reject(error);
        });
        child.on("close", (code) => {
          clearTimeout(timer);
          resolve({ code, output });
        });
      },
    );
    assert.equal(result.code, 1);
    assert.match(result.output, new RegExp(`port ${port} is already in use`));
    assert.doesNotMatch(
      result.output,
      /TalkWeave: http|WebSocket server error/,
    );
    assert.equal(fs.readFileSync(file, "utf8"), original);
  } finally {
    occupied.close();
    fs.rmSync(data, { recursive: true, force: true });
  }
});
