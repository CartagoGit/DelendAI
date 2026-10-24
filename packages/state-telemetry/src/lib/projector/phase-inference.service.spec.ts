import { EMPTY_FOLD } from './contracts/constants/work-progress.constant';
import { describe, expect, it } from 'vitest';

import type { TWorkEventKind } from '../events/work-event';
import type { IWorkPhase } from './contracts/interfaces/work-progress.interface';
import {
	advanceRank,
	inferPhase,
	phaseAtRank,
	phaseRank,
} from './phase-inference.service';
import { resolvePhaseRules } from './phase-rules.service';
import {
	foldEvents,
	deriveSnapshot,
	unknownItem,
} from './work-progress-snapshot.service';
import { makeEvent } from './test-support.helper';

type TKinds = readonly TWorkEventKind[];

/** Hand-labelled streams and the phase a person would call them. */
const labelled: ReadonlyArray<readonly [TKinds, IWorkPhase]> = [
	[[], 'investigating'],
	[['slice_claimed'], 'investigating'],
	[['lease_claimed', 'tool_called'], 'investigating'],
	[['tool_called', 'tool_finished', 'tool_called'], 'investigating'],
	[['slice_claimed', 'git_change'], 'implementing'],
	[['tool_called', 'git_change', 'git_change'], 'implementing'],
	[['git_change', 'tool_called'], 'implementing'],
	[['git_change', 'test_started'], 'testing'],
	[['tool_called', 'test_started', 'tool_called'], 'testing'],
	[['git_change', 'test_started', 'test_finished'], 'testing'],
	[['test_started', 'test_finished', 'git_change'], 'fixing'],
	[
		[
			'git_change',
			'test_started',
			'test_finished',
			'git_change',
			'git_change',
		],
		'fixing',
	],
	[['tool_error', 'git_change'], 'fixing'],
	[['git_change', 'tool_error', 'tool_error', 'git_change'], 'fixing'],
	[['slice_changes_requested'], 'fixing'],
	[['git_change', 'slice_submitted', 'slice_changes_requested'], 'reviewing'],
	[['git_change', 'stale_acceptance'], 'validating'],
	[['test_started', 'stale_acceptance', 'tool_called'], 'validating'],
	[['git_change', 'slice_submitted'], 'reviewing'],
	[['slice_submitted', 'tool_called'], 'reviewing'],
	[['git_change', 'slice_submitted', 'slice_approved'], 'reconciling'],
	[['slice_approved'], 'reconciling'],
	[['slice_approved', 'git_change', 'test_started'], 'reconciling'],
	[['git_change', 'phase_inferred'], 'implementing'],
	[['phase_inferred', 'lease_heartbeat'], 'investigating'],
	[
		['lease_claimed', 'lease_heartbeat', 'lease_heartbeat_missed'],
		'investigating',
	],
	[['git_change_stale'], 'investigating'],
	[['tool_called', 'tool_error'], 'investigating'],
	[
		[
			'git_change',
			'test_started',
			'test_finished',
			'git_change',
			'test_started',
		],
		'fixing',
	],
	[
		[
			'slice_claimed',
			'tool_called',
			'git_change',
			'test_started',
			'test_finished',
			'git_change',
			'slice_submitted',
			'slice_approved',
		],
		'reconciling',
	],
	[['proposal_transition'], 'investigating'],
	[
		['git_change', 'test_started', 'stale_acceptance', 'slice_submitted'],
		'reviewing',
	],
];

const phaseOf = (kinds: TKinds): IWorkPhase => {
	const events = kinds.map((kind, i) => makeEvent('p/S1', kind, i + 1));
	return deriveSnapshot(unknownItem('p/S1'), foldEvents(EMPTY_FOLD, events))
		.phase;
};

describe('phase inference', () => {
	it('labels at least 95% of the hand-labelled streams correctly', () => {
		const hits = labelled.filter(
			([kinds, expected]) => phaseOf(kinds) === expected,
		).length;
		expect(labelled.length).toBeGreaterThanOrEqual(30);
		expect(hits / labelled.length).toBeGreaterThanOrEqual(0.95);
	});

	it('matches a specific rule before a general one', () => {
		const rules = resolvePhaseRules();
		expect(inferPhase(rules, 'git_change', 'test_finished')).toBe('fixing');
		expect(inferPhase(rules, 'git_change', 'tool_called')).toBe(
			'implementing',
		);
		expect(inferPhase(rules, 'phase_inferred', null)).toBeUndefined();
	});

	it('lets a caller extend the table without touching the projector', () => {
		const rules = resolvePhaseRules([
			{ kind: 'lease_heartbeat', phase: 'designing' },
		]);
		expect(inferPhase(rules, 'lease_heartbeat', null)).toBe('designing');
	});

	it('never moves the phase backwards', () => {
		expect(advanceRank(phaseRank('implementing'), 'investigating')).toBe(
			phaseRank('implementing'),
		);
		expect(advanceRank(phaseRank('investigating'), 'testing')).toBe(
			phaseRank('testing'),
		);
		expect(advanceRank(3, undefined)).toBe(3);
		expect(phaseAtRank(99)).toBe('done');
	});

	it('reports the terminal statuses over the inferred phase', () => {
		const fold = foldEvents(EMPTY_FOLD, [
			makeEvent('p/S1', 'git_change', 1),
		]);
		expect(
			deriveSnapshot({ ...unknownItem('p/S1'), status: 'done' }, fold)
				.phase,
		).toBe('done');
		expect(
			deriveSnapshot({ ...unknownItem('p/S1'), status: 'blocked' }, fold)
				.phase,
		).toBe('blocked');
	});
});
