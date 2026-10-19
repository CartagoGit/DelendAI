# ER-03: per-tool permission metadata does not match the registered tools

Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

`plugins/error-reporting/plugin.manifest.ts:20–27` says the plugin ships one tool (`report_status`) and assigns it `network` + `forge-write`. The entrypoint registers both `report_status` and `diagnose_log` (`src/index.ts:342–368`); the latter is read-only by default but can open one issue only with explicit `openIssue.confirm: true` (`tools/diagnose-log.tool.ts:48–63, 193–219`). The status handler only reads the local report store and funnel counters (`tools/report-status.tool.ts:287–310`). It therefore has no network or forge-write effect, but does read local state.

Core's `resolveToolPermissions` uses a matching per-tool entry instead of the global permission set; tools without a map entry inherit the global set (`packages/core/src/lib/contracts/interfaces/plugin-tool-permissions.interface.ts:40–58`). Therefore `report_status` is described as requiring external write/network permissions and not filesystem-read, while `diagnose_log` inherits the entire plugin grant (`filesystem-read`, `filesystem-write`, `network`, `forge-write`) despite its only external effect being an explicitly confirmed issue submission. Hosts/selection policies that use the metadata can over-grant or block read-only status while broadening the other tool's declared surface.

No authorization bypass was observed in the MCP runtime. This is a manifest least-privilege and host-integration defect; classify it as P2, subject to how consuming hosts enforce the manifest metadata.
