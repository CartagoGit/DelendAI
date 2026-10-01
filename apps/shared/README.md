# `@delendai/shared`

Shared design system, i18n contract and brand assets for the
`@delendai` ecosystem. Single source of truth consumed by:

- `@delendai/ui-extension` (host-agnostic UI shell)
- `apps/web` (Astro product/docs site)
- Every host extension (`extensions/vscode` today; future hosts)
- The VS Code host's `IHostAdapter.loadWebview` (when it inlines CSS)

## Layout

```
apps/shared/
├── package.json            # @delendai/shared, private
├── tsconfig.json
├── brand/                  # logo.svg + logo-mono.svg (source of truth)
└── src/
    ├── public/index.ts     # barrel — re-exports the contract
    ├── styles/
    │   ├── _tokens.scss    # --delendai-radius, --delendai-maxw, --delendai-gap, ...
    │   ├── _themes.scss    # 5 palettes + --delendai-brand-blue/purple (only hex)
    │   ├── _index.scss     # @forward tokens + themes
    │   └── styles.scss     # placeholder for downstream consumers
    └── i18n/               # filled in S2
```

## Tokens

- `--delendai-radius`, `--delendai-maxw`, `--delendai-gap`, `--delendai-font-mono`, `--delendai-font-prose`
- Spacing scale `--delendai-s-1` … `--delendai-s-6`
- Brand colors `--delendai-brand-blue: #58a6ff`, `--delendai-brand-purple: #a371f7`
  — the **only** literals of these hex codes in source files
  (enforced by `tools/scripts/lint/no-duplicate-brand-hex.script.ts`).

## Consumers

```ts
// SCSS
@use '@delendai/shared/styles' as *;
```

```ts
// TS
import { Lang, ILangDict } from '@delendai/shared';
```