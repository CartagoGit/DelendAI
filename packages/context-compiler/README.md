# `@delendai/context-compiler` — context manifests for delegated work

Compiles what a delegated task needs (files, facts, configuration) into a
manifest of references by content hash, and expands a reference back to its
content when the subagent opens it. The subagent starts from the manifest,
not from the session that delegated the task.

It runs on any `IArtifactStore` and `IDerivationEngine` from
[`@delendai/state`](../state/README.md); delendai ships a file-backed store
and a memoising engine for them.
