// @ts-check
import { defineConfig } from "astro/config";
import baseLinks from "./src/base-links.mjs";

// Fully static build, deployed to GitHub Pages — no server logic. Content
// comes from the CMS's public /frontend-api feed at build time (see
// src/lib/emdash.ts), and the platform reverse-proxies the Pages build on
// the site's own domain.
//
// BASE_PATH (set by the deploy workflow to "/<repo>" for project Pages) makes
// the raw github.io URL work too; see src/base-links.mjs.
export default defineConfig({
	output: "static",
	base: process.env.BASE_PATH || "/",
	trailingSlash: "ignore",
	devToolbar: { enabled: false },
	integrations: [baseLinks()],
});
