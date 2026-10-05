import { createHash } from 'node:crypto';

import {
	STATE_ABI_VERSION,
	type CanonicalJsonValue,
	type IProducerContext,
	type IProducerInputSpec,
	type IProjectionResult,
	type IResolvedProducerInput,
	type IStateChange,
	type IStateProducer,
} from '@delendai/state';

import type { IWorkEvent } from '../events/work-event';
import {
	WORK_PROGRESS_INPUT_ASSIGNMENTS,
	WORK_PROGRESS_INPUT_EVENTS,
	WORK_PROGRESS_INPUT_ITEMS,
	WORK_PROGRESS_PRODUCER_ID,
	WORK_PROGRESS_PRODUCER_VERSION,
} from './contracts/constants/work-progress.constant';
import type {
	IWorkItemInput,
	IWorkProgressOptions,
	IWorkProgressRow,
} from './contracts/interfaces/work-progress.interface';
import { reconcileRows, rebuildRows } from './work-progress-snapshot.service';

/** Change kind `reconcile` understands: events appended after the base. */
export const EVENTS_APPENDED_CHANGE = 'events-appended';

export const WORK_PROGRESS_INPUTS: readonly IProducerInputSpec[] = [
	{ kind: 'opaque', locator: WORK_PROGRESS_INPUT_EVENTS },
	{ kind: 'opaque', locator: WORK_PROGRESS_INPUT_ITEMS },
	{ kind: 'opaque', locator: WORK_PROGRESS_INPUT_ASSIGNMENTS },
];

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const resolveInput = (
	locator: string,
	value: unknown,
): IResolvedProducerInput => {
	const content = encoder.encode(JSON.stringify(value));
	return {
		spec: { kind: 'opaque', locator },
		digest: createHash('sha256').update(content).digest('hex'),
		content,
	};
};

/** Pack plain inputs the way the host would hand them to the producer. */
export const encodeProducerInputs = (
	events: readonly IWorkEvent[],
	items: readonly IWorkItemInput[],
): readonly IResolvedProducerInput[] => [
	resolveInput(WORK_PROGRESS_INPUT_EVENTS, events),
	resolveInput(WORK_PROGRESS_INPUT_ITEMS, items),
	resolveInput(WORK_PROGRESS_INPUT_ASSIGNMENTS, []),
];

const readInput = <T>(ctx: IProducerContext, locator: string): readonly T[] => {
	const found = ctx.resolved.find((input) => input.spec.locator === locator);
	if (found === undefined || found.content.length === 0) return [];
	const parsed: unknown = JSON.parse(decoder.decode(found.content));
	return Array.isArray(parsed) ? (parsed as T[]) : [];
};

const toResult = (rows: readonly IWorkProgressRow[]): IProjectionResult => ({
	// The rows are plain data; the round trip proves it and drops `undefined`.
	canonical: JSON.parse(JSON.stringify({ rows })) as CanonicalJsonValue,
	raw: rows,
});

const baseRows = (ctx: IProducerContext): readonly IWorkProgressRow[] => {
	const canonical = ctx.baseProjection?.canonical;
	const rows =
		typeof canonical === 'object' &&
		canonical !== null &&
		!Array.isArray(canonical)
			? canonical['rows']
			: undefined;
	return Array.isArray(rows) ? (rows as unknown as IWorkProgressRow[]) : [];
};

/**
 * The work-progress producer. Pure and stateless: everything it needs
 * arrives in the context, and it declares the `work_events`,
 * `work_items` and `work_assignments` inputs. No tables back them yet,
 * so the host supplies each as an opaque JSON blob.
 */
export const createWorkProgressProducer = (
	options: IWorkProgressOptions = {},
): IStateProducer => ({
	id: WORK_PROGRESS_PRODUCER_ID,
	abiVersion: STATE_ABI_VERSION,
	producerVersion: WORK_PROGRESS_PRODUCER_VERSION,
	serves: ['project'],
	inputs: WORK_PROGRESS_INPUTS,
	rebuild: (ctx: IProducerContext): IProjectionResult =>
		toResult(
			rebuildRows(
				readInput<IWorkEvent>(ctx, WORK_PROGRESS_INPUT_EVENTS),
				readInput<IWorkItemInput>(ctx, WORK_PROGRESS_INPUT_ITEMS),
				options,
			),
		),
	reconcile: (
		ctx: IProducerContext,
		change: IStateChange,
	): IProjectionResult => {
		const delta =
			change.kind === EVENTS_APPENDED_CHANGE &&
			Array.isArray(change['events'])
				? (change['events'] as IWorkEvent[])
				: [];
		return toResult(
			reconcileRows(
				baseRows(ctx),
				delta,
				readInput<IWorkItemInput>(ctx, WORK_PROGRESS_INPUT_ITEMS),
				options,
			),
		);
	},
});
