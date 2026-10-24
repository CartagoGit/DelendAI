# Browser plugin

Playwright-backed browser plugin for @delendai/core. The package never bundles Chromium and never crashes when Playwright is absent; browser tools either use an injected driver or return an install hint.

## Install hint

When Playwright is not installed, real browser checks return ok false plus:

Install Playwright with `bun add -d playwright` and run `bunx playwright install chromium`.

## Usage

`browser_verify_page` verifies that a page renders the document shell expected by the same invariant guarded by `bun run verify:site-pages`: a real html root, at least one stylesheet, and a nav element.

Input shape:

```json
{
  "url": "https://example.com/docs",
  "fixture": {
    "html": "<html><body><nav>Main</nav></body></html>",
    "stylesheet": "/app.css",
    "nav": "<nav>Main</nav>"
  }
}
```

Output shape:

```json
{
  "url": "https://example.com/docs",
  "ok": true,
  "checks": {
    "html": true,
    "stylesheet": true,
    "nav": true
  },
  "mode": "fixture"
}
```

If Playwright is missing and no fixture is supplied, the tool returns the same shape with `mode: "real"`, `ok: false`, every check false, and an `installHint` string.

## Modes

`real`: uses the injected `IBrowserDriver` to open the URL, inspects the rendered HTML, and checks for `<html`, a stylesheet (`<link rel="stylesheet">` or `<style>`), and `<nav>`.

`fixture`: performs the same contract check fully in memory. `ok` is true only when `fixture.html` contains `<html>` and both `fixture.stylesheet` and `fixture.nav` are present.

## E2E recipe

Use this recipe shape when you want a repeatable page verification step in tests or docs:

```json
{
  "name": "verify rendered docs page",
  "steps": [
    {
      "tool": "browser_verify_page",
      "input": {
        "url": "https://example.com/docs"
      },
      "expect": {
        "ok": true,
        "checks": {
          "html": true,
          "stylesheet": true,
          "nav": true
        },
        "mode": "real"
      }
    }
  ]
}
```

For hermetic tests, replace the real step input with a `fixture` object and expect `mode: "fixture"`.