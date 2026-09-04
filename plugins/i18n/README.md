# @delendai/i18n

Internationalization hygiene plugin for [@delendai/core](../../packages/core).

It exposes two read-only MCP tools:

- `i18n_check` compares locale keys against scanned source usage and reports missing, unused, and simple placeholder drift.
- `i18n_validate` validates interpolation / ICU consistency and reports malformed ICU plus extra keys outside the source locale.

## Consent gate

None. Both tools are read-only and operate on workspace files only. They do not write, spawn, or call the network.

## Load

```bash
mcp-vertex --plugins=i18n
```

## Tool: i18n_check

Checks locale JSON files for:

- `missing-key` with severity `medium`
- `unused-key` with severity `low`
- `placeholder-mismatch` with severity `medium`

Nested locale objects are flattened to dot-path keys such as `menu.file.open`.

Example invocation:

```json
{
  "tool": "mcp-vertex_i18n_check",
  "arguments": {
    "localesDir": "apps/web/src/i18n/locales"
  }
}
```

Return shape:

```json
{
  "localesDir": "apps/web/src/i18n/locales",
  "locales": ["en", "es"],
  "findings": [
    {
      "ruleId": "missing-key",
      "severity": "medium",
      "message": "es: missing key \"menu.file.open\"",
      "location": { "file": "es" },
      "fix": "Add \"menu.file.open\" to the es locale."
    },
    {
      "ruleId": "unused-key",
      "severity": "low",
      "message": "en: key \"legacy.banner\" is not referenced by the scanned source files",
      "location": { "file": "en" },
      "fix": "Remove \"legacy.banner\" from en or add a matching usage in source."
    }
  ],
  "summary": {
    "critical": 0,
    "high": 0,
    "medium": 1,
    "low": 1,
    "info": 0
  },
  "worst": "medium"
}
```

## Tool: i18n_validate

Validates locale JSON messages for:

- `placeholder-mismatch` with severity `medium`
- `malformed-icu` with severity `high`
- `extra-locale` with severity `low`

Supported placeholder styles:

- `{name}`
- `{{name}}`
- `%s`, `%d`, `%i`, `%f`
- `{0}`
- ICU MessageFormat such as `{count, plural, one {# item} other {# items}}`
- ICU MessageFormat such as `{gender, select, male {his} female {her} other {their}}`

The source-of-truth locale defaults to `en` when present, otherwise the first locale in lexical order.

Example invocation:

```json
{
  "tool": "mcp-vertex_i18n_validate",
  "arguments": {
    "localesDir": "apps/web/src/i18n/locales"
  }
}
```

Return shape:

```json
{
  "localesDir": "apps/web/src/i18n/locales",
  "sourceLocale": "en",
  "locales": ["en", "es"],
  "findings": [
    {
      "ruleId": "malformed-icu",
      "severity": "high",
      "message": "es: key \"cart.items\" contains malformed ICU/interpolation syntax",
      "location": { "file": "es" },
      "fix": "Balance braces and close every ICU plural/select branch."
    },
    {
      "ruleId": "extra-locale",
      "severity": "low",
      "message": "es: key \"legacy.onlyEs\" exists here but not in source locale en",
      "location": { "file": "es" },
      "fix": "Remove \"legacy.onlyEs\" from es or add it to en."
    }
  ],
  "summary": {
    "critical": 0,
    "high": 1,
    "medium": 0,
    "low": 1,
    "info": 0
  },
  "worst": "high"
}
```

## Pure APIs

The plugin exposes pure helpers from `@delendai/i18n/public`:

- `checkLocales()`
- `extractUsedKeys()`
- `validateInterpolation()`
- `realI18nDeps()` as the production I/O adapter

## License

BSD-3-Clause © Cartago
