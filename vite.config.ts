import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    watch: {
      // Exported HTML is data, not application code. Reloading on a saved
      // export can interrupt capture or close the export dialog mid-download.
      ignored: [
        "**/.data/**",
        "**/.test-data/**",
        "**/test-results/**",
        "**/fixtures/generated/**",
        "**/playwright-report/**",
      ],
    },
  },
});
