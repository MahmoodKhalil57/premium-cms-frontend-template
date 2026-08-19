// @ts-check
import { defineConfig, fontProviders } from "astro/config";

// Static build, deployed to GitHub Pages. The platform reverse-proxies the
// Pages origin on your site's own domain, so all URLs here are root-relative.
export default defineConfig({
	output: "static",
	fonts: [
		{
			provider: fontProviders.google(),
			name: "Inter",
			cssVariable: "--font-body",
			weights: [400, 500, 600, 700],
			fallbacks: ["sans-serif"],
		},
		{
			provider: fontProviders.google(),
			name: "JetBrains Mono",
			cssVariable: "--font-mono",
			weights: [400, 500],
			fallbacks: ["monospace"],
		},
	],
});
