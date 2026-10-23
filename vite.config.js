import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    // Afbeeldingen nooit als tekst in de JavaScript stoppen: als losse
    // bestanden laden ze pas als ze in beeld komen, en start de app sneller.
    assetsInlineLimit: 0,
    rollupOptions: {
      // Losse pagina's: /privacy en /voorwaarden (links voor App Store Connect).
      input: {
        main: resolve(__dirname, "index.html"),
        privacy: resolve(__dirname, "privacy/index.html"),
        voorwaarden: resolve(__dirname, "voorwaarden/index.html"),
      },
    },
  },
  server: {
    port: Number(process.env.PORT) || 5174,
    strictPort: false,
    host: true,
  },
});
