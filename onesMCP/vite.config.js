import { defineConfig } from "vite";

const apiOrigin = process.env.ORBIT_API_ORIGIN || "http://127.0.0.1:4173";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": { target: apiOrigin },
      "/oauth": { target: apiOrigin },
    },
  },
});
