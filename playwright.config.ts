import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3100",
    env: {
      PORT: "3100",
      DATA_DIR: ".test-data/browser",
      OPENAI_API_KEY: "",
      TALKWEAVE_SKIP_ENV: "1",
    },
    reuseExistingServer: false,
    timeout: 60000,
  },
});
