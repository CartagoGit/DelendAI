import type { IProducerContext, IProjectionResult } from '@delendai/state';

import {
	asWorkItemId,
	type IWorkEvent,
	type TWorkEventKind,
} from '../events/work-event';
import type { IWorkItemInput } from './contracts/interfaces/work-progress.interface';
import { encodeProducerInputs } from './work-progress-producer.service';

export const makeEvent = (
	workItem: string,
	kind: TWorkEventKind,
	at: number,
	payloadHash = 'h',
): IWorkEvent => ({
	id: at,
	work_item_id: asWorkItemId(workItem),
	actor_id: 'a',
	kind,
	payload_hash: payloadHash,
	created_at: at,
});

export const makeContext = (
	events: readonly IWorkEvent[],
	items: readonly IWorkItemInput[],
	baseProjection?: IProjectionResult,
): IProducerContext => ({
	scope: {
		kind: 'project',
		locator: {
			workspaceRoot: '/w',
			worktreeId: 'w' as never,
			cacheRoot: '/c',
			docsRoot: '/d',
		},
	},
	fingerprint: { abiVersion: 1, producers: [] },
	resolved: encodeProducerInputs(events, items),
	...(baseProjection === undefined ? {} : { baseProjection }),
});

/** Small seeded PRNG (mulberry32): the same seed always draws the same sequence. */
export const seededRandom = (seed: number): (() => number) => {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
};

const SAMPLE_KINDS: readonly TWorkEventKind[] = [
	'git_change',
	'test_started',
	'test_finished',
	'tool_called',
	'tool_finished',
	'tool_error',
	'slice_claimed',
	'slice_submitted',
	'slice_approved',
	'slice_changes_requested',
	'stale_acceptance',
	'phase_inferred',
];

/** A random event stream over a few work items with strictly increasing timestamps. */
export const randomEvents = (
	seed: number,
	length: number,
	items: readonly string[],
): IWorkEvent[] => {
	const random = seededRandom(seed);
	const pick = <T>(list: readonly T[]): T =>
		list[Math.floor(random() * list.length)] as T;
	return Array.from({ length }, (_, i) =>
		makeEvent(
			pick(items),
			pick(SAMPLE_KINDS),
			i + 1,
			`h${Math.floor(random() * 3)}`,
		),
	);
};
