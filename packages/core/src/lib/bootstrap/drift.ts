// drift: "did this project change shape since the last analysis?"
//
// Without a watchdog, the bootstrap workflow is fire-and-forget: an
// agent calls `analyze_project` once, gets a plan, scaffolds it, and
// walks away. The next time the project changes (new script, dropped
// dep, framework upgrade, monorepo package added), nothing tells the
// server that the cached blueprint is now stale.
//
// `drift.ts` is the cheapest viable answer: persist the last analysis
// to `<cacheDir>/drift/last-analysis.json` (mutex + atomic write,
// matching the durable-store invariants in AGENTS.md) and diff the
// current analysis against it. The output is a structured report the
// agent can read on the next turn and act on — usually by re-calling
// `plan_mcp_project` and reconciling the new blueprint.
//
// Design notes (f00051 S3):
// - Pure: the diff is a function over `(current, last)`. The persistence
//   seam (`loadLastAnalysis` / `saveLastAnalysis`) is a separate module
//   so the diff stays unit-testable with no filesystem.
// - Reuses the durable-store primitives (`withFileMutex` +
//   `writeFileAtomic` + `quarantineCorruptFile`) — see invariant #4 in
//   AGENTS.md ("New persisted state → mutex + atomic write + a
//   corruption test").
// - The drift is a diff on the *structured* analysis, NOT on raw
//   `package.json` text. Two projects with identical scripts but
//   different `name` produce no drift.

import type { IProjectAnalysis } from './analyze-project';

export interface IDriftChange {
	readonly kind:
		| 'script-added'
		| 'script-dropped'
		| 'framework-changed'
		| 'language-changed'
		| 'monorepo-changed'
		| 'package-manager-changed'
		| 'test-runner-changed'
		| 'mcp-server-added'
		| 'mcp-server-dropped'
		| 'ci-changed'
		| 'agent-config-changed';
	readonly summary: string;
}

export interface IDriftReport {
	readonly hasDrift: boolean;
	readonly changes: readonly IDriftChange[];
	/** Set when this is the first analysis ever (no previous snapshot). */
	readonly isFirstSnapshot: boolean;
	/** When the last analysis was recorded (ISO) or null when first. */
	readonly lastSnapshotAt: string | null;
	/** One-line summary the agent can read at a glance. */
	readonly summary: string;
}

const fmtSet = (a: readonly string[], b: readonly string[]): string => {
	const setA = new Set(a);
	const setB = new Set(b);
	const added = [...setB].filter((x) => !setA.has(x));
	const dropped = [...setA].filter((x) => !setB.has(x));
	const parts: string[] = [];
	if (added.length > 0) parts.push(`+${added.join(',+')}`);
	if (dropped.length > 0) parts.push(`-${dropped.join(',-')}`);
	return parts.length === 0 ? 'unchanged' : parts.join(' ');
};

const scriptKeys = (
	scripts: Readonly<Record<string, string>>,
): readonly string[] => Object.keys(scripts).sort();

const sameStrings = (a: readonly string[], b: readonly string[]): boolean => {
	if (a.length !== b.length) return false;
	const sa = [...a].sort();
	const sb = [...b].sort();
	return sa.every((v, i) => v === sb[i]);
};

export const diffAnalysis = (
	current: IProjectAnalysis,
	last: IProjectAnalysis | undefined,
	lastSnapshotAt: string | null,
): IDriftReport => {
	if (last === undefined) {
		return {
			hasDrift: true,
			changes: [],
			isFirstSnapshot: true,
			lastSnapshotAt: null,
			summary:
				'First snapshot: nothing to compare against. Call `plan_mcp_project` to bootstrap the server from this analysis.',
		};
	}

	const changes: IDriftChange[] = [];

	// Scripts (the most actionable signal: a new `e2e` script means a
	// missing `run_e2e` tool).
	const lastScripts = scriptKeys(last.scripts);
	const curScripts = scriptKeys(current.scripts);
	if (!sameStrings(lastScripts, curScripts)) {
		const added = curScripts.filter((s) => !lastScripts.includes(s));
		const dropped = lastScripts.filter((s) => !curScripts.includes(s));
		for (const s of added) {
			changes.push({
				kind: 'script-added',
				summary: `New script "${s}" → suggested tool: \`run_${s}\``,
			});
		}
		for (const s of dropped) {
			changes.push({
				kind: 'script-dropped',
				summary: `Script "${s}" was removed; retire the \`run_${s}\` tool`,
			});
		}
	}

	if (last.framework !== current.framework) {
		changes.push({
			kind: 'framework-changed',
			summary: `framework: ${last.framework ?? '(none)'} → ${current.framework ?? '(none)'}`,
		});
	}
	if (last.language !== current.language) {
		changes.push({
			kind: 'language-changed',
			summary: `language: ${last.language} → ${current.language}`,
		});
	}
	if (last.monorepoTool !== current.monorepoTool) {
		changes.push({
			kind: 'monorepo-changed',
			summary: `monorepo tool: ${last.monorepoTool ?? '(none)'} → ${current.monorepoTool ?? '(none)'}`,
		});
	}
	if (last.packageManager !== current.packageManager) {
		changes.push({
			kind: 'package-manager-changed',
			summary: `package manager: ${last.packageManager} → ${current.packageManager}`,
		});
	}
	if (last.testRunner !== current.testRunner) {
		changes.push({
			kind: 'test-runner-changed',
			summary: `test runner: ${last.testRunner} → ${current.testRunner}`,
		});
	}
	if (last.hasMcpProject !== current.hasMcpProject) {
		changes.push({
			kind: current.hasMcpProject
				? 'mcp-server-added'
				: 'mcp-server-dropped',
			summary: current.hasMcpProject
				? 'An MCP server appeared; consider `diff_capabilities` before scaffolding'
				: 'MCP server was removed; this server is now the only one in the project',
		});
	}
	if (!sameStrings(last.ci, current.ci)) {
		changes.push({
			kind: 'ci-changed',
			summary: `CI: ${fmtSet(last.ci, current.ci)}`,
		});
	}
	if (!sameStrings(last.agentConfigs, current.agentConfigs)) {
		changes.push({
			kind: 'agent-config-changed',
			summary: `agent configs: ${fmtSet(last.agentConfigs, current.agentConfigs)}`,
		});
	}

	const summary =
		changes.length === 0
			? 'No drift detected since the last analysis.'
			: `${changes.length} change(s) since last analysis: ${changes
					.map((c) => c.kind)
					.join(', ')}.`;

	return {
		hasDrift: changes.length > 0,
		changes,
		isFirstSnapshot: false,
		lastSnapshotAt,
		summary,
	};
};
