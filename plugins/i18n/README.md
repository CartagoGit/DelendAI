# @mcp-vertex/i18n

Internationalization-hygiene plugin for [`@mcp-vertex/core`](../../packages/core).

## Tools

- **`i18n_check`** — check locale JSON files for consistency: keys present in
  some locales but missing in others (`missing-key`, medium) and interpolation
  placeholder mismatches for the same key (`placeholder-mismatch`, medium).
  Nested keys are flattened to `a.b.c`. Pass `localesDir` (default `locales`).

Offline, pure. The check is a pure function (exported from
`@mcp-vertex/i18n/public`) over an injected locale reader.

## Load

```bash
mcp-vertex --plugins=i18n
```

## License

BSD-3-Clause © Cartago
