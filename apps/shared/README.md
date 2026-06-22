# `@mcp-vertex/shared`

Shared design system, i18n contract and brand assets for the
`@mcp-vertex` ecosystem. Single source of truth consumed by:

- `@mcp-vertex/ui-extension` (host-agnostic UI shell)
- `apps/web` (Astro product/docs site)
- Every host extension (`extensions/vscode` today; future hosts)
- The VS Code host's `IHostAdapter.loadWebview` (when it inlines CSS)

## Layout

```
apps/shared/
├── package.json            # @mcp-vertex/shared, private
├── tsconfig.json
├── brand/                  # logo.svg + logo-mono.svg (source of truth)
└── src/
    ├── public/index.ts     # barrel — re-exports the contract
    ├── styles/
    │   ├── _tokens.scss    # --mv-radius, --mv-maxw, --mv-gap, ...
    │   ├── _themes.scss    # 5 palettes + --mv-brand-blue/purple (only hex)
    │   ├── _index.scss     # @forward tokens + themes
    │   └── styles.scss     # placeholder for downstream consumers
    └── i18n/               # filled in S2
```

## Tokens

- `--mv-radius`, `--mv-maxw`, `--mv-gap`, `--mv-font-mono`, `--mv-font-prose`
- Spacing scale `--mv-s-1` … `--mv-s-6`
- Brand colors `--mv-brand-blue: #58a6ff`, `--mv-brand-purple: #a371f7`
  — the **only** literals of these hex codes in source files
  (enforced by `tools/scripts/lint/no-duplicate-brand-hex.script.ts`).

## Consumers

```ts
// SCSS
@use '@mcp-vertex/shared/styles' as *;
```

```ts
// TS
import { Lang, ILangDict } from '@mcp-vertex/shared';
```