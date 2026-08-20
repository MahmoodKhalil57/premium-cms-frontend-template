/**
 * Apply seed/seed.json to this site's CMS instance. Runs in the deploy
 * workflow BEFORE the build, so the static frontend pre-renders against the
 * content it ships with. Also runnable locally:
 *
 *   CMS_SEED_TOKEN=... bun scripts/apply-seed.ts
 *
 * The seed is a living migration: applied with update-on-conflict, so
 * editing it and redeploying updates the instance (slug-matched upserts).
 * Sensitive values stay out of the repo — any {"$env": "NAME"} value in
 * the seed is replaced with the environment variable NAME at apply time,
 * and the endpoint is authenticated with the CMS_SEED_TOKEN env var.
 */
import { CMS_URL } from "../src/config";

const seedFile = Bun.file(new URL("../seed/seed.json", import.meta.url));
if (!(await seedFile.exists())) {
	console.log("apply-seed: no seed/seed.json — nothing to apply.");
	process.exit(0);
}
const token = process.env.CMS_SEED_TOKEN?.trim();
if (!token) {
	console.log("apply-seed: CMS_SEED_TOKEN is not set — skipping seed apply.");
	process.exit(0);
}
if (!CMS_URL) {
	console.log("apply-seed: CMS_URL is not configured in src/config.ts — skipping seed apply.");
	process.exit(0);
}

/** Replace {"$env": "NAME"} values with the NAME environment variable. */
function resolveEnv(node: unknown, path: string): unknown {
	if (Array.isArray(node)) return node.map((item, i) => resolveEnv(item, `${path}[${i}]`));
	if (node && typeof node === "object") {
		const obj = node as Record<string, unknown>;
		if (typeof obj.$env === "string" && Object.keys(obj).length === 1) {
			const value = process.env[obj.$env];
			if (value === undefined) throw new Error(`seed ${path} references $env "${obj.$env}", which is not set`);
			return value;
		}
		return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, resolveEnv(v, `${path}.${k}`)]));
	}
	return node;
}

const seed = resolveEnv(await seedFile.json(), "$");
const res = await fetch(`${CMS_URL}/seed-api`, {
	method: "POST",
	headers: { "Content-Type": "application/json", "x-provision-secret": token },
	body: JSON.stringify(seed),
});
const body = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: unknown; error?: string };
if (!res.ok || !body.ok) {
	console.error(`apply-seed: failed (${res.status}): ${body.error ?? "unknown error"}`);
	process.exit(1);
}
console.log("apply-seed: applied.", JSON.stringify(body.result));
