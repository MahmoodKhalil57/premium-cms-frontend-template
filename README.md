# PremiumCMS frontend template

The base image for a PremiumCMS site's frontend. When you click **Set up
frontend on GitHub Pages** in your site's admin, the platform generates your
repository from this template, writes your site's values into
`src/config.ts`, and configures GitHub Pages — no DNS changes, ever.

It is a static [Astro](https://astro.build) build of the same theme your CMS
renders: the layout, components, and design tokens are copied from the
EmDash Astro template, so the frontend and the CMS-rendered pages look like
one site.

## How it fits together

- **Build-time content.** `astro build` pre-renders the pages with real
  content from your CMS's public feed (`/frontend-api/*`). Every push to
  `main` rebuilds and redeploys via the **Deploy to GitHub Pages** workflow.
- **Your domain serves it automatically.** The platform reverse-proxies this
  Pages build on your site's own domain. Paths this frontend doesn't
  implement (post detail pages, `/search`, `/rss.xml`, `/tag/...`) fall
  through to the CMS-rendered site, and `/_emdash/admin` always stays with
  the CMS.
- **Fail-soft builds.** If the CMS is unreachable at build time, the build
  still succeeds with the identity baked into `src/config.ts` and an empty
  post list — a deploy never breaks because of a network blip.

## Content as code: the seed

`seed/seed.json` is this site's content migration. On every deploy, the
workflow applies it to your CMS **before** building (update-on-conflict,
matched by slug), then pre-renders against the result — so committing a
content change and pushing is a complete publish. Keep evolving it through
the development cycle: pages, posts, settings, menus, taxonomies all
belong here. Anything sensitive stays out of the repo — write
`{"$env": "NAME"}` in the seed and set `NAME` in the workflow environment;
the apply step authenticates with the `CMS_SEED_TOKEN` repository secret
(set automatically when the platform created this repo).

Content created directly in the CMS admin is untouched unless the seed
uses the same slug — the seed owns what it names, the admin owns the rest.

## Editing

| What                 | Where                                              |
| -------------------- | -------------------------------------------------- |
| Colors, type, layout | `src/styles/theme.css` (overrides `tokens.css`)    |
| Header / footer      | `src/layouts/Base.astro`                           |
| Home page            | `src/pages/index.astro`                            |
| Posts list           | `src/pages/posts/index.astro`                      |
| Navigation menus     | `getMenu()` in `src/lib/emdash.ts`                 |
| CMS URL & identity   | `src/config.ts` (written by the platform)          |

Add more pages under `src/pages/` — anything you add shadows the CMS route
of the same path; anything you don't stays CMS-rendered.

## Local development

```bash
bun install
bun run dev
```

Content is fetched from the `CMS_URL` in `src/config.ts`.
