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
