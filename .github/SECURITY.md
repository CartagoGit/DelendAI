# Security Policy

## Reporting a vulnerability

Please report security issues **privately**, not via a public issue:

- Use GitHub's [private vulnerability reporting](https://github.com/CartagoGit/delendai/security/advisories/new)
  ("Report a vulnerability" on the Security tab), or
- email the maintainer (see the `author` field in `package.json`).

Include repro steps, affected version(s), and impact. You'll get an
acknowledgement; once a fix is released we'll credit you unless you prefer to stay
anonymous.

## Supported versions

The project is pre-1.0 (`0.x`). Security fixes land on the latest published minor;
please upgrade to the newest version before reporting.

## Security model — what the design already does

`delendai` runs as an MCP server a host (an agent/IDE) drives. Its posture:

- **Workspace containment, in two layers.** Lexically, `resolveWorkspaceContained`
  rejects `..` traversal and absolute paths outside the workspace and its
  authorized roots. Physically, core's file primitives go further: `fsRead`,
  `fsWrite` and `resolveWorkspaceContainedEffective` compare the `realpath` of
  the target with the `realpath` of each authorized root, so a pre-existing
  symlink that points outside the workspace is refused before the file is
  opened (`path escapes workspace via symlink`). Plugins resolve their path
  inputs physically too, and `lint:plugin-physical-containment` fails CI on a
  lexical-only resolution in plugin code.
- **Command allow/deny policy.** The `quality` plugin only spawns commands that
  pass an explicit policy (a trust boundary); timeouts kill the whole process
  group, leaving no zombies.
- **Secret redaction.** Durable stores (`memory`, `proposals`) run user text
  through `redactSecrets` (PEM keys, JWTs, cloud/provider tokens, `key=value`
  secrets) before writing, so a pasted credential is not persisted in clear.
- **Safe state I/O.** Atomic writes + a cross-process mutex (ownership token +
  heartbeat) + corruption quarantine (corrupt ≠ empty) protect the on-disk state.
- **No network by default.** `search`, `docs`, `deps`, `memory`, `git` are
  read-only and offline; nothing phones home.
- **Strict input validation.** Zod schemas (`.strict()`, `.min(1)`, no unknown
  keys) on every tool input.

## Known limits (your host's sandbox still matters)

- **Physical containment is defence in depth, not a TOCTOU guarantee.** A
  symlink swapped in between the check and the read or write can still escape.
  Rely on the host's filesystem sandbox as the last boundary.
- `quality` executes commands you allow — keep the policy tight.
- Secret redaction favours precision over recall: it catches high-confidence
  shapes, not every possible secret. Don't paste credentials into tool inputs.
