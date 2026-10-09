import {
	STATE_ABI_VERSION,
	type CanonicalJsonValue,
	type IProducerContext,
	type IProducerInputSpec,
	type IProjectionResult,
	type IStateProducer,
} from '@delendai/state';

import {
	ROADMAP_PRODUCER_ID,
	ROADMAP_PRODUCER_VERSION,
	ROADMAP_PROPOSALS_INDEX_LOCATOR,
} from '../contracts/constants/roadmap-producer.constant';
import type { IRoadmapGateEvidence } from '../contracts/interfaces/gate.interface';
import type {
	IRoadmapProducerOptions,
	IRoadmapProjection,
} from '../contracts/interfaces/roadmap-producer.interface';
import { splitRoadmapFile } from '../store/roadmap-file-codec.helper';
import { readRoadmap } from '../validation/roadmap-reader.service';
import { projectRoadmap } from './roadmap.projection.service';

const decoder = new TextDecoder();

const readText = (
	ctx: IProducerContext,
	locator: string,
): string | undefined => {
	const found = ctx.resolved.find((input) => input.spec.locator === locator);
	return found === undefined || found.content.length === 0
		? undefined
		: decoder.decode(found.content);
};

/** The proposal ids and statuses the host handed in; anything else is ignored. */
const readStatuses = (
	ctx: IProducerContext,
): Readonly<Record<string, string>> => {
	const text = readText(ctx, ROADMAP_PROPOSALS_INDEX_LOCATOR);
	if (text === undefined) return {};
	try {
		const parsed: unknown = JSON.parse(text);
		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			Array.isArray(parsed)
		) {
			return {};
		}
		return Object.fromEntries(
			Object.entries(parsed).filter(
				(pair): pair is [string, string] => typeof pair[1] === 'string',
			),
		);
	} catch {
		return {};
	}
};

const evidenceFrom = (ctx: IProducerContext): IRoadmapGateEvidence => {
	const statuses = readStatuses(ctx);
	return { proposalStatus: (id) => statuses[id] };
};

const project = (
	ctx: IProducerContext,
	options: IRoadmapProducerOptions,
): IRoadmapProjection => {
	const text = readText(ctx, options.roadmapLocator);
	if (text === undefined) {
		return { horizons: [] };
	}
	const split = splitRoadmapFile(options.roadmapLocator, text);
	if (!split.ok) return { error: split.reason };
	const roadmap = readRoadmap(split.value.data);
	return roadmap.ok
		? projectRoadmap(roadmap.value, evidenceFrom(ctx))
		: { error: roadmap.reason };
};

const toResult = (projection: IRoadmapProjection): IProjectionResult => ({
	// The round trip proves the projection is plain data and drops `undefined`.
	canonical: JSON.parse(JSON.stringify(projection)) as CanonicalJsonValue,
	raw: projection,
});

/**
 * The roadmap as a State Engine producer. It declares exactly two inputs,
 * the roadmap file and the proposal index, and derives everything from
 * them without touching markdown, git or code. The projection is a cheap
 * pure function of those inputs, so reconciling a change recomputes it
 * from the new inputs: the incremental and the clean path are the same
 * computation by construction, and the property spec holds them to it.
 */
export const createRoadmapProducer = (
	options: IRoadmapProducerOptions,
): IStateProducer => {
	const inputs: readonly IProducerInputSpec[] = [
		{ kind: 'file', locator: options.roadmapLocator },
		{ kind: 'opaque', locator: ROADMAP_PROPOSALS_INDEX_LOCATOR },
	];
	return {
		id: ROADMAP_PRODUCER_ID,
		abiVersion: STATE_ABI_VERSION,
		producerVersion: ROADMAP_PRODUCER_VERSION,
		serves: ['project'],
		inputs,
		rebuild: (ctx) => toResult(project(ctx, options)),
		reconcile: (ctx) => toResult(project(ctx, options)),
	};
};
