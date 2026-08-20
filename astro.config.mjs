// @ts-check
import { defineConfig } from "astro/config";

// Fully static build, deployed to GitHub Pages — no server logic. Content
// comes from the CMS's public /frontend-api feed at build time (see
// src/lib/emdash.ts), and the platform reverse-proxies the Pages build on
// the site's own domain.
export default defineConfig({
	output: "static",
	devToolbar: { enabled: false },
});
