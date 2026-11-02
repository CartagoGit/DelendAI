// drift: "did this project change shape since the last analysis?".
//
// SOLID — Single Responsibility. After the refactor this file is a
// THIN COMPOSER. The three concerns (scripts, stack fingerprint,
// metadata) each live in their own detector module:
//
//   - scripts-drift-detector.ts  → script-added, script-dropped
//   - stack-drift-detector.ts   → framework, language, monorepo,
//                                 package manager, test runner,
//                                 mcp-server presence
//   - metadata-drift-detector.ts → ci, agent-configs
//
// The composer owns ONLY: the public types, the default detector
// chain, and the one-line summary formatter.

import type { IProjectAnalysis } from './analyze-project';
import type { IDriftDetector } from './drift-detector';
import { ScriptsDriftDetector } from './scripts-drift-detector';
import { StackDriftDetector } from './stack-drift-detector';
import { MetadataDriftDetector } from './metadata-drift-detector';

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

/**
 * The default detector chain. The order is meaningful only for the
 * summary line (changes appear in the listed order); the report
 * itself does not depend on it.
 */
export const DEFAULT_DRIFT_DETECTORS: readonly IDriftDetector[] = [
	new ScriptsDriftDetector(),
	new StackDriftDetector(),
	new MetadataDriftDetector(),
];

export interface IDiffAnalysisOptions {
	/**
	 * Inject a custom detector chain. Defaults to
	 * `DEFAULT_DRIFT_DETECTORS`. Hosts that want to add their own
	 * concern (e.g. `dependencies-changed`) append a custom
	 * `IDriftDetector` here without forking `diffAnalysis`.
	 */
	readonly detectors?: readonly IDriftDetector[];
}

const formatSummary = (changes: readonly IDriftChange[]): string => {
	if (changes.length === 0)
		return 'No drift detected since the last analysis.';
	return `${changes.length} change(s) since last analysis: ${changes
		.map((c) => c.kind)
		.join(', ')}.`;
};

export const diffAnalysis = (
	current: IProjectAnalysis,
	last: IProjectAnalysis | undefined,
	lastSnapshotAt: string | null,
	options: IDiffAnalysisOptions = {},
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
	const detectors = options.detectors ?? DEFAULT_DRIFT_DETECTORS;
	const changes: IDriftChange[] = [];
	for (const detector of detectors) {
		changes.push(...detector.detect({ current, last }));
	}
	return {
		hasDrift: changes.length > 0,
		changes,
		isFirstSnapshot: false,
		lastSnapshotAt,
		summary: formatSummary(changes),
	};
};

// Re-export the public surface of the detector modules so the
// bootstrap barrel can ship a single import surface.
export type { IDriftDetector, IDriftDetectorContext } from './drift-detector';
export { formatSetDiff, sameStrings } from './drift-detector';
export { ScriptsDriftDetector } from './scripts-drift-detector';
export { StackDriftDetector } from './stack-drift-detector';
export { MetadataDriftDetector } from './metadata-drift-detector';
