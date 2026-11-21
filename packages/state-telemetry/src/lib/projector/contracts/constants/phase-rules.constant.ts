import type { IPhaseRule } from '../interfaces/work-progress.interface';

/**
 * Default phase table. Order matters: the first rule whose kind (and
 * `afterKind`, when set) matches wins, so the more specific rules come
 * before the general ones. Extend by passing extra rules to
 * `resolvePhaseRules`; the projector itself never changes.
 */
export const DEFAULT_PHASE_RULES: readonly IPhaseRule[] = [
	{ kind: 'git_change', afterKind: 'test_finished', phase: 'fixing' },
	{ kind: 'git_change', afterKind: 'tool_error', phase: 'fixing' },
	{ kind: 'git_change', phase: 'implementing' },
	{ kind: 'slice_changes_requested', phase: 'fixing' },
	{ kind: 'tool_called', phase: 'investigating' },
	{ kind: 'tool_finished', phase: 'investigating' },
	{ kind: 'lease_claimed', phase: 'investigating' },
	{ kind: 'slice_claimed', phase: 'investigating' },
	{ kind: 'test_started', phase: 'testing' },
	{ kind: 'stale_acceptance', phase: 'validating' },
	{ kind: 'slice_submitted', phase: 'reviewing' },
	{ kind: 'slice_approved', phase: 'reconciling' },
];
