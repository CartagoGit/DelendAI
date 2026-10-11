/**
 * envelope.helper.ts — what the roadmap tools share: how they are built, how
 * they read the authority file, and the shapes more than one of them
 * returns. No tool throws at its host; a failure is an error envelope
 * with the reason the roadmap gave.
 */
import z from 'zod';

import { toolError } from '@delendai/core/public';

import { ROADMAP_GATE_STATUSES } from '../../contracts/constants/gate.constant';
import {
	ROADMAP_BUMP_HINTS,
	ROADMAP_ENTRY_KINDS,
	ROADMAP_ENTRY_STATES,
} from '../../contracts/constants/roadmap.constant';
import type { IRoadmapGateEvidence } from '../../contracts/interfaces/gate.interface';
import type { IRoadmap } from '../../contracts/interfaces/roadmap.interface';
import type { IRoadmapWorkspace } from '../../contracts/interfaces/roadmap-workspace.interface';
import { gatherGateEvidence } from '../../workspace/gate-evidence.service';

export const entryKindSchema = z.enum(ROADMAP_ENTRY_KINDS);
export const entryStateSchema = z.enum(ROADMAP_ENTRY_STATES);
export const bumpHintSchema = z.enum(ROADMAP_BUMP_HINTS);

export const gateVerdictSchema = z.object({
	status: z.enum(ROADMAP_GATE_STATUSES),
	reason: z.string(),
});

export const blockerSchema = z.object({
	entryId: z.string(),
	state: entryStateSchema,
	gates: gateVerdictSchema,
});

/** Narrows the answer to one horizon; every horizon when absent. */
export const versionInputSchema = z
	.object({ version: z.string().min(1).optional() })
	.strict();

export const invalidArguments = (issues: readonly z.core.$ZodIssue[]) =>
	toolError(
		issues
			.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; '),
		'Fix the arguments and call again.',
		'invalid-arguments',
	);

export const roadmapUnreadable = (reason: string) =>
	toolError(
		reason,
		'Fix the roadmap file by hand; it is the authority and no tool rewrites what it cannot read.',
		'roadmap-unreadable',
	);

/** The roadmap and the evidence for its gates, or the error to return. */
export const loadRoadmap = async (
	workspace: IRoadmapWorkspace,
): Promise<
	| {
			readonly ok: true;
			readonly roadmap: IRoadmap;
			readonly evidence: IRoadmapGateEvidence;
	  }
	| { readonly ok: false; readonly error: ReturnType<typeof toolError> }
> => {
	const read = await workspace.roadmap.read();
	if (!read.ok) return { ok: false, error: roadmapUnreadable(read.reason) };
	return {
		ok: true,
		roadmap: read.value,
		evidence: await gatherGateEvidence(read.value, workspace),
	};
};

/** The horizons asked for, or the error naming the one that is not there. */
export const horizonsOf = (roadmap: IRoadmap, version: string | undefined) => {
	const horizons = roadmap.horizons.filter(
		(horizon) => version === undefined || horizon.version === version,
	);
	return version !== undefined && horizons.length === 0
		? {
				ok: false as const,
				error: toolError(
					`the roadmap has no horizon ${version}`,
					`Its horizons are: ${roadmap.horizons.map((horizon) => horizon.version).join(', ') || '(none)'}.`,
					'unknown-version',
				),
			}
		: { ok: true as const, horizons };
};
