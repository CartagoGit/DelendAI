# Migration to DelendAI — workspace bridge & the `@delendai/*` audit

> **Slice:** b00239 **S3** — [`Puente local para workspaces ya adoptados`](../proposals/ready/breakings/b00239-rebrand-delendai-delendai-cli-unico-alias-est-conflict-safe-y-auto-migracion-idempotente-de-workspaces-legacy.md).
> **Status:** shipped on `develop`. Companion slices (S4–S9) land in
> follow-up proposals; this page only documents what S3 itself ships.

This page answers three questions project maintainers ask first when they
hear "the CLI was renamed":

1. *What happens to scripts and CI that invoke the old names?*
2. *Is anyone still publishing the old `@delendai/*` packages?*
3. *What about the project I closed two years ago — will it ever update?*

The TL;DR for each is below; the sections that follow add the technical
detail.

- **Old names keep working** for one release, via a workspace-local
  bridge this CLI installs on demand (`delendai bridge install`).
- **No one ever published the old scope.** The registry audit on
  2026-09-04 returned HTTP 404 for every `@delendai/*` we checked. There
  is no release bridge needed on npm — that window does not exist.
- **A project that never runs new code cannot be migrated automatically.**
  That is documented below as the *frozen-project limitation*. It is not
  a tool gap; it is what "never runs new code" means.

---

## Scope

`delendai bridge install` (this slice) writes a small workspace-local
directory:

```
<your-project>/
└── scripts/
    └── legacy-bridge/
        ├── README.md      ← explains what the directory is, generated once
        ├── delendai        ← POSIX shim (chmod +x applied)
        ├── delendai.cmd   ← Windows cmd.exe shim (CRLF)
        ├── delendai.ps1   ← Windows PowerShell shim
        ├── delendai.cmd   ← second legacy name (Windows)
        └── delendai.ps1
```

Each shim is between 5 and 15 lines, carries
`# delendai-legacy-bridge:v1 — auto-installed by \`delendai bridge install\``,
and does nothing other than look up the canonical `delendai` on `PATH`
and re-exec it with the same argv. The canonical `delendai` already runs
the migration guard (b00239 S2) at its own entrypoint, so a workspace
that previously ran `delendai init` and now runs `delendai init` is the
exact same code path — the shim is a forwarding wrapper, not a second
implementation.

### What the bridge covers automatically

- A workspace that runs new code at all (which all of them do:
  `bun install` on a fresh checkout re-runs lifecycle scripts,
  `delendai` itself re-execs when invoked, etc.) gets cured on the
  next entry point. The migration runs **once**; the journal lives at
  `.delendai/migrations-applied.json` and is honoured on every
  subsequent run, so `delendai init` after `delendai init` is a single
  probe and zero writes.

### What the bridge does NOT cover

- **Frozen projects.** A project whose lockfile is from 2025 and whose
  dependency install never re-runs new code cannot be auto-migrated.
  See the next section.
- **The host-level tooling.** Cursor / Claude Code / Codex etc. keep
  what they have until their own project is opened. That is S5's work.
  The bridge here is a workspace-local installation; it does not
  rewrite a host config.
- **Packages on `npm`.** The bridge is the only release there is, and
  it ships with `delendai` itself. There is no
  `@delendai/cli-legacy-bridge` package to install separately.

---

## Frozen-project limitation

> *If a project never executes new code, no tool can change its files.*

That is not a defect; it is the definition of "never executes new code".
A `delendai bridge install` cannot reach into a directory tree that has
not been opened, and a migration cannot reach a file that has not been
read.

**Concrete example.** Suppose a project on `bun install` with a
lockfile from 2025 has, in `package.json`, a script `"ci": "delendai
build"` and a `bun.lockb` that resolves `delendai` to a 2025-era
version. The project was last touched in December 2024; nothing in it
ever runs again. No migration tool — not this one, not any other —
will run against it, because every migration tool needs to run, and
this project does not run.

What the project owner can do, manually, in this case:

1. Open the project locally.
2. Run `bun install` once (which pulls the current `delendai`).
3. Run `delendai bridge install` once (which writes the bridge
   directory).
4. Run `delendai` once with no arguments (which triggers the
   migration guard via the S2 entrypoint).
5. Commit the bridge directory and the migration journal.

This is the same five-step ritual any time a project jumps several
versions; the bridge does not invent a way to do it without the user
opening the project, because no tool can.

---

## Bridge install / status / remove

The subcommand set mirrors `delendai alias status|install|remove` so
users who learned one do not have to relearn the other. The shapes and
rationales are documented next to the alias help; here we just describe
the surface.

### `delendai bridge status`

Reports each legacy bin name and what currently occupies it.

```bash
$ delendai bridge status
{
  "bridgeDir": "./scripts/legacy-bridge",
  "canonical": "delendai",
  "readmePresent": true,
  "shims": [
    {
      "legacyName": "delendai",
      "state": "ours",
      "paths": ["./scripts/legacy-bridge/delendai"]
    },
    {
      "legacyName": "delendai",
      "state": "ours",
      "paths": ["./scripts/legacy-bridge/delendai"]
    }
  ]
}
```

The four `state` values are `absent`, `ours`, `foreign`, `unreadable` —
the same vocabulary the alias manager uses. `foreign` means
"something else occupies this name, the tool left it alone, the
canonical CLI still works". `unreadable` means "the tool could not read
the file to decide whether it is ours, so it left it alone" — an
explicit refusal rather than a guess, because guessing wrong here is
deleting somebody's file.

### `delendai bridge install`

Writes the shims that are `absent` and skips the ones already present
(`ours`) or occupied by other software (`foreign` / `unreadable`).
Idempotent: a second run is `action: 'unchanged'`.

```bash
$ delendai bridge install
{
  "action": "created",
  ...
}
```

Override the workspace root when the command is invoked from a different
directory than the one to install into:

```bash
delendai bridge install --workspace=/path/to/other/checkout
```

### `delendai bridge remove`

Removes only the shims whose marker this tool wrote. Leaves alone
anything the tool did not create (foreign or unreadable), anything
that has been edited by hand (the marker disappears → reclassified as
foreign), and anything it never installed.

```bash
$ delendai bridge remove
{
  "action": "created",
  ...
}
```

After `bridge remove`, the `scripts/legacy-bridge/` directory may
still contain foreign files you never asked this tool to delete. Move
them manually if you want them gone — the bridge will not assume it
is the only writer to that directory.

---

## Registry audit

> *No `@delendai/*` was ever published.*

Verified on **2026-09-04** against the npm registry (cited in the
proposal's *Inventario cuantificado* section):

| Package               | HTTP status |
| --------------------- | ----------- |
| `@delendai/core`      | 404         |
| `@delendai/cli`       | 404         |
| `@delendai/contracts` | 404         |
| `@delendai/client`    | 404         |

…and no other package exists under the `@delendai` scope on the
registry. Combined with `git grep` against the tree (5.828 files
versioned as of 2026-09-04), the conclusion is that the codebase
references `@delendai/*` purely as imports / workspace dependencies,
not as registered releases. There is **no release bridge to publish**
because there is no release to bridge to.

**Operational consequence.** When this project publishes for the first
time, the first `@delendai/*` it ships will be the canonical one. No
deprecation notice; no coexistence window. The whole migration
strategy reduces to "convince existing adopted workspaces to come up
on a build that contains this CLI", which is what this CLI does on
its own entrypoint.

---

## Residual scanner

S8 adds a residual-identity scanner after the migration has run. Its
job is not "rewrite every old token you can still find"; its job is to
distinguish the references that are still **actionable** from the ones
that are merely a record of what used to be true.

The scanner searches these nine legacy patterns:

- `@mcp-vertex`
- `MCP-VERTEX`
- `MCP_VERTEX`
- `MCP Vertex`
- `mcp_vertex`
- `mcpvertex`
- `mcp-vertex`
- `mcpv`
- `--mcp-vertex-*`

Each hit is classified into one of four buckets:

- **LIVE** — must reach zero before the migration reports success.
- **HISTORICAL** — a true statement about the past; rewriting it would falsify the record.
- **VENDORED / THIRD-PARTY** — not ours to edit.
- **GENERATED** — fix the source, then regenerate.

### LIVE vs HISTORICAL

This is the only part with real judgement. The rule used by the scanner
is conservative: if a hit is not clearly historical, vendored or
generated, it is reported as **LIVE**.

Examples:

- **HISTORICAL**: `MCP Vertex 0.1.x used to write its cache under .cache/mcp-vertex.`
- **HISTORICAL**: `Previously, @mcp-vertex/core exposed the old registry path.`
- **LIVE**: `Install @mcp-vertex/cli globally before running tests.`
- **LIVE**: `bun run dev -- --mcp-vertex-home=.cache/mcp-vertex`

The asymmetry is intentional. A hit incorrectly marked **LIVE** costs a
human one more look. A hit incorrectly marked **HISTORICAL** ships a
broken migration while the tool reports success.

---

## FAQ

### What breaks if I run `delendai bridge install` twice?

Nothing. The installer is idempotent — the second run produces
`action: 'unchanged'` and zero writes. The marker inside every shim is
what makes the recogniser detect its own files; without it, a re-run
could overwrite a foreign shim the user added by hand, which is the
opposite of safe.

### What if I uninstalled `@delendai/cli`?

Then `delendai bridge install` will still write the bridge directory —
the installer does not depend on a network call, only on the local
filesystem — but invoking a shim afterwards will fail with
`exit 127` because the shim looks for `delendai` on `PATH`. Re-install
`@delendai/cli` (`bun add -g @delendai/cli` or the local equivalent)
and the existing bridge picks up where it left off. The shim does
not need to be removed and rewritten; the recogniser still considers
it `ours` because the marker is unchanged.

### What about Windows shims?

The bridge directory on Windows contains both `*.cmd` (for `cmd.exe`
users and any consumer that goes through `process.Start("delendai")`)
and `*.ps1` (for PowerShell scripts that pre-resolve the script path).
Both carry the marker, so `bridge status` reports `ours` for either.
`.cmd` is written with CRLF line endings; `.ps1` and the README are LF.
PowerShell's `PATHEXT` honoured `*.ps1` when the bare name is invoked,
so a caller that does `& delendai …` from a `ps1` script picks up the
`.ps1` shim; a CI that invokes `cmd /c "delendai …"` picks up the
`.cmd` shim. Both call the same canonical binary.

### Can I `PATH`-link the bridge directory into `/usr/local/bin`?

Not recommended. `bridge install` writes a *workspace*-owned directory
on purpose; the design is that the bridge is local to the project that
needs it. Linking it into a system bin dir would make it globally
visible — which is exactly what `delendai alias install` is for (S1),
with its own `leave-foreign-alone` rule. Use one or the other, not
both, and remove the bridge directory when you no longer need it.

### What if my CI invokes a legacy bin name from a directory OTHER
than the workspace?

Same answer as the first FAQ: the shim looks up `delendai` on `PATH`
regardless of cwd. So long as `delendai` is on the CI runner's PATH
(and it is, because the CI shell scripts that previously invoked
`delendai` had it there too), the shim works. If you use a sandboxed
PATH in CI, set `DELENDAI_CLI_BIN` (handled by the shim) to the
absolute install path.

---

## See also

- [Proposal b00239](../proposals/ready/breakings/b00239-rebrand-delendai-delendai-cli-unico-alias-est-conflict-safe-y-auto-migracion-idempotente-de-workspaces-legacy.md)
  — every cross-cutting invariant this page documents, in their original
  context.
- `delendai alias status|install|remove` (S1) — the system-alias side of
  the same vocabulary; same four cases (`absent`, `ours`, `foreign`,
  `unreadable`), same recogniser pattern.
- [`NPM_PUBLISH.md`](../NPM_PUBLISH.md) — what publishing looks like
  after this slice lands. The "no `@delendai/*` ever published" audit
  above is the registration policy that follows.
