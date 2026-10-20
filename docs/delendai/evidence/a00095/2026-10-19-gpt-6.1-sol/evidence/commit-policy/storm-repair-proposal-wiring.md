# CP-11: storm repair proposal writer has no production store port

Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

`plugins/commit-policy/src/index.ts:402–418` says `IMcpPluginContext` has no peer-provided proposal-store field, explicitly leaves the port uninjected, and calls `fileRepairProposals` with only `workspaceRoot`, `cacheDir`, and `docsDir`. The function requires `options.proposalStore`; when absent it returns `proposed: false` with `NO_PROPOSAL_STORE_REASON` (`repair-proposer.ts:301–343, 347–377`). Repository-wide source search found no production creation or injection of that port; the only implementation shape is declared within commit-policy, and no other source imports it.

The registered `commit_policy_storms` tool is read-only and its MCP summary says x00419 lets agents “file `kind: fix` proposals without a human intermediary” (`tools/storms-tool.ts:81–94`). Runtime storm events are persisted by `onResult`; `fileRepairProposals` is called only during plugin registration, after replaying old logs. Since the registration passes no store and runtime storm events do not invoke the proposer, no qualifying storm can be auto-filed through the production path.

This is incomplete product functionality, not a data loss claim. Storm detection, persistence and diagnostics remain available. The implementation comment calls auto-filing a nice-to-have, which limits severity; the public tool summary still advertises it. No proposals store was written during this audit.
