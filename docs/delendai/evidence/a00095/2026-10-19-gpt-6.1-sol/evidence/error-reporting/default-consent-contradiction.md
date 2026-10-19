# ER-02: reporting default contradicts adopter documentation

Snapshot: `514758e783620c8953079be4d71fceccacb3de8b`.

The runtime resolves absent `enabled` to `true` (`plugins/error-reporting/src/lib/options.service.ts:48–56`), the manifest says “on by default” and marks the plugin `startupActivation: true` (`plugin.manifest.ts:8–19`), and its startup message says automatic issue creation is on and names the opt-out (`startup-notice.helper.ts:25–33`). In contrast, the adopter README says “Disabled by default” and instructs enabling it (`README.md:12–18`), its options table says default `false` (`README.md:96–104`), and model-facing generated knowledge says “Disabled by default; network dispatch is explicit opt-in” (`src/lib/knowledge/error-reporting.ts:14–18`).

This is a user-facing consent and setup contradiction: a reader or agent following README/knowledge may expect no report submission, but the actual standard-preset runtime dispatches automatically unless `enabled: false` is configured. The startup notice does disclose the actual runtime state at each start, which limits but does not remove the risk from copied defaults, unattended hosts, or setup decisions made from stale model-facing guidance. No external submission was made during audit.
