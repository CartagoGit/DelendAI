# @delendai/link-check

Docs-integrity plugin for [`@delendai/core`](../../packages/core).

## Tools

- **`link_check`** — verify markdown links across the workspace and return
  normalized findings: relative targets that do not exist (`broken-link`, high),
  `#anchor` fragments with no matching heading (`broken-anchor`, medium — GitHub
  slug rules), and empty `[text]()` targets (`empty-link`, low). **External
  links (http/mailto/…) are never fetched** — the check is fully offline. Skips
  `node_modules`, `dist`, `build`, `.cache`, `.git`. A great pre-publish docs
  gate.

Offline, pure. The link + anchor checks are pure functions (exported from
`@delendai/link-check/public`) over an injected reader.

## Load

```bash
delendai --plugins=link-check
```

## License

BSD-3-Clause © Cartago
