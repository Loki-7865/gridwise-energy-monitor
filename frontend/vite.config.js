import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The React development server runs on :5173 while Docker serves the API on
// :8080. Proxying keeps frontend requests same-origin during local development.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/data": "http://localhost:8080",
      "/history": "http://localhost:8080",
      "/demo": "http://localhost:8080",
      "/health": "http://localhost:8080",
    },
  },
});
