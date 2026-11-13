# Frameworks — frontend & backend MCP servers

> The framework ecosystem is **the messiest** part of the MCP catalog. Most
> "framework MCPs" are one-off community projects that:
>
> 1. Get a few hundred stars.
> 2. Work for the maintainer's use case.
> 3. Stop being updated when the next framework version ships.
>
> **For Angular specifically**, the situation is critical: the three names
> the original f00068 proposal listed (`cyanheads/angular-mcp-server`,
> `darioz-ms/angular-mcp`, `Microcks/angular-mcp`) all **return 404** on
> 2026-06-26. There is **no currently maintained Angular-specific MCP server**
> that we could verify. The pragmatic option is to fall back to
> `mcp-language-server` (which has Angular LSP support via `angular-language-server`)
> for symbol/definition/rename, and use `@upstash/context7-mcp` for
> version-specific docs.

## Frontend frameworks

### React / React Native

| Server | Maintainer | Status | Recommendation |
|---|---|---|---|
| `@react/mcp` (community) | Community | Listed in catalogs | **Don't wire**. The "official" community React MCP is shallow (just docs lookup); use `context7` instead. |
| `react-analyzer-mcp` ([azer](https://github.com/azer/react-analyzer-mcp)) | Community | Listed | OK for static analysis if you need it; tiny scope. |
| `react-native-mcp` | Community | Listed | OK if you maintain RN apps. |
| `expo-mcp` | Community | Listed | OK if you maintain Expo apps. |

For React code: **rely on `mcp-language-server`** for symbol-level tools +
**`context7-mcp`** for current docs. Don't bother with a React-specific MCP.

### Vue / Nuxt

| Server | Maintainer | Status | Recommendation |
|---|---|---|---|
| `vue-mcp` (community) | Community | Listed | **Don't wire**. Same pattern: use `context7` for docs, LSP for symbols. |
| `nuxt-mcp` | Community | Listed | Niche. Skip. |

### Svelte / SvelteKit

| Server | Maintainer | Status | Recommendation |
|---|---|---|---|
| `svelte-mcp` | Community | Listed | Same as Vue. Skip; rely on context7 + svelte-language-server via mcp-language-server. |

### Angular — **NO RECOMMENDED MCP CURRENTLY EXISTS**

I searched on 2026-06-26 for:
- `cyanheads/angular-mcp-server` → 404 (moved or deleted).
- `darioz-ms/angular-mcp` → 404.
- `Microcks/angular-mcp` → 404.

There may be forks or new repos that I didn't catch (Angular ecosystem moves
fast). When unpausing f00068, **re-verify Angular MCP options before
including them in the curated tier**. The pragmatic alternative stack:

1. **`@upstash/context7-mcp`** — pulls the current Angular docs into the
   prompt, version-specific. Solves 90% of "how do I do X in Angular 17/18/19"
   questions.
2. **`mcp-language-server` (isaacphi)** — works against any LSP, including
   the Angular Language Service (`angular-language-server`). Provides
   `get_definition`, `find_references`, `rename_symbol`, `diagnostics`.
3. **`chrome-devtools-mcp`** — for inspecting the rendered DOM, checking the
   console, profiling.

This is a strictly better stack than any Angular-specific MCP would be
(because the Angular-specific ones go stale as soon as the framework ships a
new major; `context7` + LSP + DevTools are framework-version agnostic).

### Next.js / Nuxt / Astro / SvelteKit / Remix / Solid / Qwik

All of these are best served by:
- `context7` for docs (one server covers all of them).
- `mcp-language-server` for symbols (one LSP wrapper, all frameworks).
- `chrome-devtools-mcp` for runtime debugging.

There is no scenario where a framework-specific MCP is better than this
combination, **except** for very narrow framework-specific tools
(like Figma-to-React codegen, which is a different category).

### Build tooling

| Server | Maintainer | Status | Recommendation |
|---|---|---|---|
| `vite-mcp` | Community | Listed | Skip; Vite errors show up in `chrome-devtools-mcp` console. |
| `webpack-mcp` | Community | Listed | Skip. |
| `cypress-mcp` | Community | Listed | OK if you maintain Cypress tests; otherwise use `chrome-devtools-mcp` + your test runner via Bash. |
| `storybook-mcp` (storybookjs/addon-mcp) | Storybook | Official | **Wire** if you use Storybook. 1.3M weekly visitors on pulse.mcp.com — the Storybook team itself ships it. |

## Backend frameworks

Most backend-framework MCPs are pointless: the agent doesn't need a
"framework-specific" tool to read your NestJS decorators or Rails controllers.
Use `mcp-language-server` + `context7` for the same coverage.

The **only** backend-framework MCPs we found worth mentioning:

| Server | Maintainer | Notes |
|---|---|---|
| `django-mcp` | Community | Only if you have a Django-heavy codebase and the LSP wrapper doesn't cut it. |
| `fastapi-mcp` | Community | Wire **only if** you actually want to expose your FastAPI endpoints as MCP tools. |

For everything else (Spring, NestJS, Rails, Laravel, Express, FastAPI,
Phoenix, Actix, Gin, etc.):

- `context7-mcp` for version-pinned docs.
- `mcp-language-server` for code navigation.
- **No framework-specific MCP needed.**

## Component / Storybook / Design

| Server | Maintainer | Recommendation |
|---|---|---|
| `storybookjs/addon-mcp` | Storybook | **Wire** if you use Storybook. Helps agents write stories + tests against your actual components. |
| `shadcn-ui-mcp-server` ([Jpisnice](https://github.com/Jpisnice/shadcn-ui-mcp-server)) | Community | Wire if your project uses shadcn/ui — saves the agent from hallucinating component APIs. |
| `mcp-react-analyzer` | Community | Skip; redundant with LSP. |

## What f00068 needs to update

The original ⭐ curated tier mentioned:
- `angular-mcp` → **drop from curated**. Use `context7` + LSP + DevTools.
- `@react/mcp` → **drop from curated**. Use `context7`.
- `vue-mcp`, `svelte-mcp`, `next-mcp` → **drop from curated**. Same pattern.

Move them all to 🟡 discoverable tier with a `// community-maintained, may
be stale — prefer context7` note.

The only **framework-specific** server we recommend wiring up by default is
**`storybookjs/addon-mcp`**, and only if the workspace has a Storybook.