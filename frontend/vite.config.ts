import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const configuredDevServerPort = process.env.VITE_DEV_SERVER_PORT || process.env.PORT;
const devServerPort = Number(configuredDevServerPort || 5173);

export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: devServerPort,
    strictPort: Boolean(configuredDevServerPort),
  },
});
