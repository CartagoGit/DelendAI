# Lint Rules

## privacy-validator-no-expansion (x00256 / PRIV-002)

The privacy validator in `plugins/error-reporting/src/lib/privacy-validator.helper.ts` is the last barrier before the public DTO. It is intentionally limited to the canonical blocked-class set listed in `PRIVACY_VALIDATOR_BLOCKED_CLASSES` (12 classes today: absolute paths, Windows paths, non-allowlisted URLs, email, IP, UUID, JWT / auth tokens, git metadata, branch names, JSON / XML / SQL-like fragments). The fix for new private-data classes is **always** provenance (Track B): never widen the regex surface with "looks like a company name" heuristics.

This lint scans the validator source for new top-level `const` arrays whose entries are > 5 capitalised words and lack a legitimate URL / path / format / pattern context comment. It also reminds the operator to delete the `tests/fixtures/privacy-validator-anti-pattern.ts` bait file once the guard has been verified.

Invocation:

```sh
bun tools/scripts/lint/privacy-validator-no-expansion.script.ts            # dry-run
bun tools/scripts/lint/privacy-validator-no-expansion.script.ts --apply   # blocking
```

The lint is wired into `bun run lint:privacy` so it runs as part of every CI gate. To legitimately add a new blocked class:

1. Add a regex constant in `privacy-validator.helper.ts`.
2. Add the matching `stringReason(...)` clause.
3. Append the new short code to `PRIVACY_VALIDATOR_BLOCKED_CLASSES` (between the `PRIV-002 SET START` / `PRIV-002 SET END` markers).
4. Update `privacy-validator.spec.ts` so the `exposes exactly the documented set of blocked classes` test pins the new shape AND the `no blocked class is added without updating the set test above` length check.
5. Document the change in the ADR; link it from the proposal.

## architecture-readfile-via-safe-reader

This lint scans plugins whose manifest declares `filesystem-read` and blocks direct `readFile` or `readFileSync` usage in their `src` tree.

The rule exists to preserve the filesystem containment invariant introduced by SafeWorkspaceReader in @mcp-vertex/core.

Allowed patterns:

- Reads routed through SafeWorkspaceReader.
- Local implementation files named safe-reader.ts or safe-workspace-reader.ts.
- Explicit legacy allowlist entries inside the lint script, each with a mandatory reason.

Rejected patterns:

- `import { readFile } from 'node:fs/promises'` in a filesystem-read plugin source file.
- `import { readFileSync } from 'node:fs'` in a filesystem-read plugin source file.
- `fs.readFile(...)` or `fs.readFileSync(...)` through a namespace import from node:fs.

To migrate a plugin off the allowlist, replace direct reads with SafeWorkspaceReader and then remove its allowlist entry from the lint script.