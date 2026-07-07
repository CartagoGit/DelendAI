/**
 * opt-in-snippets.constant.ts — f00098 S1+S2.
 *
 * The exact opt-in commands the plugin-absent render-models carry so
 * every host (vscode panel, web showcase) shows the same actionable
 * hint. Neither plugin ships in any preset; the runner hard-depends on
 * usage-tracking, so its snippet enables both.
 */

/** Opt-in for the provider dashboard (runner depends on usage-tracking). */
export const ORCHESTRATOR_RUNNER_OPT_IN_SNIPPET =
	'mcp-vertex --plugins=usage-tracking,orchestrator-runner';

/** Opt-in for the usage cost card (usage-tracking alone). */
export const USAGE_TRACKING_OPT_IN_SNIPPET =
	'mcp-vertex --plugins=usage-tracking';
