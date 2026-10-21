# Isolated build: environment correction and verified result

Snapshot df29b656ca803d2c9e8b453092b4566b07c8ddb4. Source is the tracked Git archive in an owned temporary directory, not the shared checkout or another work unit. The reviewed build/brand/bundler entrypoints compile code and emit declarations/assets; no application entrypoint or provider was launched.

The initial bun run build attempt reused only root node_modules through a symlink. It lacked the per-workspace dependency links of an actual install and failed with missing shared type imports. This result is an environment limitation, not a confirmed source/build defect. The symlink was removed only after completion; the underlying dependency directory was left untouched.

A frozen offline install with lifecycle scripts disabled created the snapshot own dependency layout: bun install --frozen-lockfile --ignore-scripts --offline, exit0,761packages. Only this owned directory build outputs were cleared, then bun run build exited0 and reported74packages built. This control refutes interpreting the earlier missing-module diagnostics as a product failure. Both complete command logs and scripts are retained.

No source patch, dependency/lockfile update, gate exclusion, online request or provider/account invocation was required. This is a compilation/declaration check, not a full validate, browser/site build, external clean install from the registry or end-to-end host acceptance.
