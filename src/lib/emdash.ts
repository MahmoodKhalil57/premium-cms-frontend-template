/**
 * Build-time data layer for the PremiumCMS frontend template.
 *
 * The pages in this template are copied from the EmDash Astro theme, which
 * reads its content through the `emdash` package. This module provides the
 * same call surface, backed by the CMS instance's public content feed
 * (`/frontend-api/*`) at BUILD time — `astro build` pre-renders the pages
 * with real content. Pushing to main (or the platform dispatching the
 * deploy workflow) rebuilds with fresh content.
 *
 * Every fetch is fail-soft: if the CMS is unreachable the build still
 * succeeds with empty content rather than failing the deploy.
 */
import { CMS_URL, SITE_TITLE, TAGLINE } from "../config";

/* ------------------------------------------------------------------ */
/* Types mirrored from the emdash package (subset the template uses)   */
/* ------------------------------------------------------------------ */

export interface PortableTextBlock {
	_type: string;
	children?: unknown[];
	[key: string]: unknown;
}

export interface MediaValue {
	id?: string;
	alt?: string;
	width?: number;
	height?: number;
	mimeType?: string;
	filename?: string;
}

export interface ContentBylineCredit {
	byline: {
		displayName: string;
		avatarMediaId?: string | null;
	};
}

export interface Entry {
	/** The slug — used in URLs, matching emdash's entry.id convention. */
	id: string;
	data: {
		/** The database ULID. */
		id: string;
		slug: string;
		title?: string;
		excerpt?: string;
		content?: PortableTextBlock[];
		featured_image?: MediaValue | null;
		publishedAt?: Date | null;
		bylines: ContentBylineCredit[];
	};
}

interface Row {
	id: string;
	slug: string;
	title?: string;
	excerpt?: string;
	content?: string;
	featured_image?: string;
	published_at?: string;
	created_at?: string;
}

/* ------------------------------------------------------------------ */
/* Data access (build-time, against the CMS's public feed)             */
/* ------------------------------------------------------------------ */

async function feed<T>(path: string): Promise<T | null> {
	if (!CMS_URL) return null;
	try {
		const res = await fetch(`${CMS_URL}${path}`, { signal: AbortSignal.timeout(15000) });
		if (!res.ok) return null;
		return (await res.json()) as T;
	} catch {
		return null;
	}
}

function parseJson<T>(value: string | null | undefined): T | undefined {
	if (!value) return undefined;
	try {
		return JSON.parse(value) as T;
	} catch {
		return undefined;
	}
}

function toEntry(row: Row): Entry {
	const publishedRaw = row.published_at ?? row.created_at;
	const published = publishedRaw ? new Date(publishedRaw) : null;
	return {
		id: row.slug,
		data: {
			id: row.id,
			slug: row.slug,
			title: row.title,
			excerpt: row.excerpt,
			content: parseJson<PortableTextBlock[]>(row.content),
			featured_image: parseJson<MediaValue>(row.featured_image) ?? null,
			publishedAt: published && !Number.isNaN(published.getTime()) ? published : null,
			bylines: [],
		},
	};
}

export async function getEmDashCollection(
	collection: string,
	options?: { orderBy?: Record<string, string>; limit?: number },
): Promise<{ entries: Entry[]; cacheHint: Record<string, never> }> {
	const limit = Math.min(options?.limit ?? 50, 50);
	const data = await feed<{ items?: Row[] }>(`/frontend-api/${collection}.json?limit=${limit}`);
	return { entries: (data?.items ?? []).map(toEntry), cacheHint: {} };
}

export async function getSiteSettings(): Promise<{ title?: string; tagline?: string }> {
	const data = await feed<{ title?: string; tagline?: string }>("/frontend-api/site.json");
	// Fall back to the identity baked into src/config.ts when the CMS is unreachable.
	return {
		title: data?.title ?? (SITE_TITLE || undefined),
		tagline: data?.tagline ?? (TAGLINE || undefined),
	};
}

/** Menus come from the CMS Menus manager, with a static default when the
 *  CMS has none (or is unreachable at build time). */
let menusPromise: Promise<Record<string, { items: Array<{ url: string; label: string; target?: string }> }>> | null =
	null;

function fetchMenus(): Promise<Record<string, { items: Array<{ url: string; label: string; target?: string }> }>> {
	menusPromise ??= (async () => {
		const data = await feed<{ menus?: Record<string, { items: Array<{ url: string; label: string; target?: string }> }> }>(
			"/frontend-api/layout.json",
		);
		return data?.menus ?? {};
	})();
	return menusPromise;
}

export async function getMenu(
	name: string,
): Promise<{ items: Array<{ url: string; label: string; target?: string }> } | null> {
	const menus = await fetchMenus();
	if (menus[name]?.items?.length) return menus[name];
	if (name === "primary") {
		return {
			items: [
				{ url: "/", label: "Home" },
				{ url: "/posts", label: "Posts" },
				{ url: "/search", label: "Search" },
			],
		};
	}
	return null;
}

/** Taxonomy terms need an authenticated API; the template renders without tags. */
export async function getTermsForEntries(
	_collection: string,
	_entryIds: string[],
	_taxonomy: string,
): Promise<Map<string, Array<{ slug: string; label: string }>>> {
	return new Map();
}
