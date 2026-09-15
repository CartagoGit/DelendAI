---
id: f00542
title: "Delendai language-, IDE-, and OS-agnostic"
kind: feat
status: ready
type: proposal
track: general
date: 2026-09-15
---

# f00542 — Delendai language-, IDE-, and OS-agnostic

## Goal

Make delendai work for **any programming language, any IDE, and any OS** without compromising the current TypeScript dogfooding experience. Concretely: a language-agnostic plugin manifest (JSON Schema, available in TS/Python/Go/Rust/Java/.NET), a polyglot plugin runtime registry (bun/node/python/go/rust/java/dotnet/native), an OS abstraction layer (Linux/macOS/Windows/WSL/BSD), a universal bootstrap installer (deb/rpm/pkg/msi/winget/scoop/brew/tarball), language-agnostic quality presets (Python, Rust, Go, Java, .NET, Elixir, Ruby, PHP, Swift), IDE connector generators (VS Code, JetBrains, Cursor, Neovim), and signature verification for plugins.

## why

Today delendai is deeply tied to TypeScript/Bun for core and VS Code as its primary IDE. This locks adoption: developers in Java/Rust/Go/Elixir/.NET face a tooling tax to adopt delendai. Without P8, every other proposal (P1-P7) ends up built on a TS-only base, capping adoption before it begins. P8 is the transversal ceiling.

## non-goals

- Not rewriting existing plugins in other languages; they keep their runtime.
- Not supporting zombie IDEs (Sublime, Atom).
- Not supporting exotic OSes (Plan 9, TempleOS); document incompatibilities instead.
- Not providing a native GUI per OS.
- Not bundling language runtimes; installers declare what is needed.

## Slices

- global_gate: type

### S1 — Language-agnostic plugin manifest (JSON Schema) and validators
- **Status**: pending
- **Files**: `plugins/manifest/schema.json`, `plugins/manifest/ts-validator.ts`, `plugins/manifest/py-validator.py`, `plugins/manifest/go-validator/main.go`, `plugins/manifest/rust-validator/Cargo.toml`, `plugins/manifest/java-validator/...`, `plugins/manifest/dotnet-validator/...`, `plugins/manifest/tests/manifest-conformance.spec.ts`
- **Gate**: type
- acceptance:
  - "Single JSON Schema file describes runtime, transport, integrity, tools, capabilities, ideHooks."
  - "Validator implementations exist in TS, Python, Go, Rust, Java, .NET and pass the same fixture corpus."
  - "Manifest carries no TS-specific shapes (no `kind: 'ts-bun'` semantics baked in)."

### S2 — Polyglot plugin runtime registry
- **Status**: pending
- **Files**: `packages/core/src/lib/plugin-runtime/registry.ts`, `packages/core/src/lib/plugin-runtime/adapters/bun.ts`, `packages/core/src/lib/plugin-runtime/adapters/node.ts`, `packages/core/src/lib/plugin-runtime/adapters/python.ts`, `packages/core/src/lib/plugin-runtime/adapters/go.ts`, `packages/core/src/lib/plugin-runtime/adapters/rust.ts`, `packages/core/src/lib/plugin-runtime/adapters/java.ts`, `packages/core/src/lib/plugin-runtime/adapters/dotnet.ts`, `packages/core/src/lib/plugin-runtime/adapters/native.ts`, `packages/core/tests/plugin-runtime/registry.spec.ts`
- **Gate**: type
- acceptance:
  - "Each adapter implements IPluginRuntimeAdapter (detect, install hint, spawnPlugin, probeHealth, stop)."
  - "TS-based plugins keep working unchanged (backcompat strict)."
  - "A Python plugin with manifest runtime kind=python registers its tools successfully in a conformance test."

### S3 — OS abstraction layer
- **Status**: pending
- **Files**: `packages/core/src/lib/os/contract.ts`, `packages/core/src/lib/os/implementations/linux.ts`, `packages/core/src/lib/os/implementations/darwin.ts`, `packages/core/src/lib/os/implementations/windows.ts`, `packages/core/src/lib/os/implementations/bsd.ts`, `packages/core/src/lib/os/implementations/wsl.ts`, `packages/core/src/lib/os/selection.ts`, `packages/core/tests/os/contract-conformance.spec.ts`
- **Gate**: type
- acceptance:
  - "Contract covers paths, env, fs quirks (case sensitivity, line endings, max path, forbidden names), process (signal map, kill tree, elevation), shell (default shell, quote rules), user, capabilities."
  - "grep -R returns zero `path.join`/`process.platform`/`os.platform` usages outside the OS abstraction."
  - "WSL implementation bridges Windows and Linux views for path resolution."

### S4 — Universal bootstrap installer
- **Status**: pending
- **Files**: `bin/install/main.go (or ts equivalent)`, `bin/install/strategies/deb.ts`, `bin/install/strategies/rpm.ts`, `bin/install/strategies/appimage.ts`, `bin/install/strategies/brew.ts`, `bin/install/strategies/pkg.ts`, `bin/install/strategies/msi.ts`, `bin/install/strategies/winget.ts`, `bin/install/strategies/scoop.ts`, `bin/install/strategies/tarball.ts`, `bin/install/tests/install.spec.ts`
- **Gate**: type
- acceptance:
  - "curl ... sh works on Ubuntu, Debian, Fedora, RHEL, Arch, Alpine (warning), macOS Intel and Apple Silicon, Windows PowerShell and CMD."
  - "--dry-run, --prefix, --no-sudo flags work across strategies."
  - "Fallback to tarball + sh installer when no native package is available."

### S5 — Polyglot quality presets
- **Status**: pending
- **Files**: `packages/core/src/lib/quality/presets/typescript.ts`, `packages/core/src/lib/quality/presets/python.ts`, `packages/core/src/lib/quality/presets/rust.ts`, `packages/core/src/lib/quality/presets/go.ts`, `packages/core/src/lib/quality/presets/java.ts`, `packages/core/src/lib/quality/presets/kotlin.ts`, `packages/core/src/lib/quality/presets/dotnet.ts`, `packages/core/src/lib/quality/presets/elixir.ts`, `packages/core/src/lib/quality/presets/ruby.ts`, `packages/core/src/lib/quality/presets/php.ts`, `packages/core/src/lib/quality/presets/swift.ts`, `packages/core/src/lib/quality/presets/registry.ts`, `packages/core/tests/quality/presets.spec.ts`
- **Gate**: type
- acceptance:
  - "Each preset declares its linter, typechecker, test runner, formatter, security tool."
  - "run_quality can mix presets in the same repo (e.g. TS frontend + Python backend)."
  - "Output is normalized to the existing delendai quality schema regardless of preset."

### S6 — IDE connector generators
- **Status**: pending
- **Files**: `packages/core/src/lib/ide/generator.ts`, `packages/core/src/lib/ide/targets/vscode.ts`, `packages/core/src/lib/ide/targets/jetbrains.ts`, `packages/core/src/lib/ide/targets/cursor.ts`, `packages/core/src/lib/ide/targets/neovim.ts`, `packages/core/tests/ide/generator.spec.ts`
- **Gate**: type
- acceptance:
  - "delendai ide generate-vscode produces a working extension folder from a plugin manifest."
  - "delendai ide generate-jetbrains produces plugin.xml + action class skeletons."
  - "delendai ide generate-neovim produces Lua + which-key + Telescope bindings."
  - "Generators are idempotent: running twice yields the same tree."

### S7 — Transport variants (gRPC, MCP, HTTP+protobuf)
- **Status**: pending
- **Files**: `packages/core/src/lib/plugin-runtime/transport/stdio-jsonrpc.ts`, `packages/core/src/lib/plugin-runtime/transport/grpc.ts`, `packages/core/src/lib/plugin-runtime/transport/mcp.ts`, `packages/core/src/lib/plugin-runtime/transport/http-protobuf.ts`, `packages/core/tests/plugin-runtime/transport.spec.ts`
- **Gate**: type
- acceptance:
  - "A plugin using stdio JSON-RPC today still loads."
  - "gRPC, MCP, and HTTP+protobuf transports are interchangeable at runtime via configuration."
  - "End-to-end test exercises one plugin over each transport."

### S8 — Plugin integrity and signing
- **Status**: pending
- **Files**: `packages/core/src/lib/plugin-runtime/integrity.ts`, `packages/core/src/lib/plugin-runtime/trust-root.ts`, `packages/core/tests/plugin-runtime/integrity.spec.ts`
- **Gate**: type
- acceptance:
  - "Manifest includes signature and public key (Sigstore/cosign inspired)."
  - "Core rejects plugins whose signature does not verify against the configured trust root."
  - "Local development flow allows self-signed manifests without disabling trust permanently."

### S9 — Cross-OS test matrix
- **Status**: pending
- **Files**: `.github/workflows/cross-os.yml`, `tools/scripts/ci/cross-os-smoke.script.ts`, `plugins/proposals/tests/cross-os/harness.spec.ts`
- **Gate**: type
- acceptance:
  - "CI matrix runs on Ubuntu latest, Fedora latest, macOS latest intel and arm64, Windows latest and Server 2022."
  - "WSL smoke test verifies path bridge behaviour."
  - "Self-hosted runner recipe documented for cost-effective local CI."

### S10 — Docs and migration guides
- **Status**: pending
- **Files**: `docs/delendai/cross-platform.md`, `docs/delendai/porting-plugin-to-python.md`, `docs/delendai/authoring-language-preset.md`, `docs/delendai/authoring-ide-connector.md`, `CHANGELOG.md`
- **Gate**: lint
- acceptance:
  - "All four authoring guides have a worked example end to end."
  - "Migration guide covers porting a TS-bun plugin to Python including manifest changes."
  - "CHANGELOG entry explains backcompat guarantees."

## acceptance

- Single JSON Schema file describes runtime, transport, integrity, tools, capabilities, ideHooks.
- Validator implementations exist in TS, Python, Go, Rust, Java, .NET and pass the same fixture corpus.
- Manifest carries no TS-specific shapes (no `kind: 'ts-bun'` semantics baked in).
- Each adapter implements IPluginRuntimeAdapter (detect, install hint, spawnPlugin, probeHealth, stop).
- TS-based plugins keep working unchanged (backcompat strict).
- A Python plugin with manifest runtime kind=python registers its tools successfully in a conformance test.
- Contract covers paths, env, fs quirks (case sensitivity, line endings, max path, forbidden names), process (signal map, kill tree, elevation), shell (default shell, quote rules), user, capabilities.
- grep -R returns zero `path.join`/`process.platform`/`os.platform` usages outside the OS abstraction.
- WSL implementation bridges Windows and Linux views for path resolution.
- curl ... sh works on Ubuntu, Debian, Fedora, RHEL, Arch, Alpine (warning), macOS Intel and Apple Silicon, Windows PowerShell and CMD.
- --dry-run, --prefix, --no-sudo flags work across strategies.
- Fallback to tarball + sh installer when no native package is available.
- Each preset declares its linter, typechecker, test runner, formatter, security tool.
- run_quality can mix presets in the same repo (e.g. TS frontend + Python backend).
- Output is normalized to the existing delendai quality schema regardless of preset.
- delendai ide generate-vscode produces a working extension folder from a plugin manifest.
- delendai ide generate-jetbrains produces plugin.xml + action class skeletons.
- delendai ide generate-neovim produces Lua + which-key + Telescope bindings.
- Generators are idempotent: running twice yields the same tree.
- A plugin using stdio JSON-RPC today still loads.
- gRPC, MCP, and HTTP+protobuf transports are interchangeable at runtime via configuration.
- End-to-end test exercises one plugin over each transport.
- Manifest includes signature and public key (Sigstore/cosign inspired).
- Core rejects plugins whose signature does not verify against the configured trust root.
- Local development flow allows self-signed manifests without disabling trust permanently.
- CI matrix runs on Ubuntu latest, Fedora latest, macOS latest intel and arm64, Windows latest and Server 2022.
- WSL smoke test verifies path bridge behaviour.
- Self-hosted runner recipe documented for cost-effective local CI.
- All four authoring guides have a worked example end to end.
- Migration guide covers porting a TS-bun plugin to Python including manifest changes.
- CHANGELOG entry explains backcompat guarantees.
