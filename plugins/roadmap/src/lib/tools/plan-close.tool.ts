import z from 'zod';

import type { IToolRegistration } from '@delendai/core/contracts';
import { toolError, toolJson } from '@delendai/core/public';

import type {
	IRoadmapEntry,
	IRoadmapEntryState,
} from '../contracts/interfaces/roadmap.interface';
import type { IRoadmapToolOptions } from '../contracts/interfaces/roadmap-workspace.interface';
import { evaluateEntryGates } from '../gates/gate-evaluator.service';
import { entryDetail } from '../read-model/roadmap-summary.service';
import { checkTransition } from '../state-machine/roadmap-state-machine.service';
import {
	entryStateSchema,
	gateVerdictSchema,
	invalidArguments,
	loadRoadmap,
} from './shared/envelope.helper';
import { recordChange } from './shared/record-change.helper';

/** The states an entry is closed into. */
const CLOSING_STATES = [
	'delivered',
	'deferred',
	'dropped',
	'superseded',
] as const;

const INPUT = z
	.object({
		entry: z.string().min(1),
		to: z.enum(CLOSING_STATES),
		/**
		 * Why. Required unless the entry is closed as delivered with every
		 * gate passing: the gates are then the reason.
		 */
		reason: z.string().min(1).optional(),
		/** The entry that replaces this one; with `superseded` only. */
		supersededBy: z.string().min(1).optional(),
		actor: z.string().min(1).optional(),
	})
	.strict();

const OUTPUT = z.object({
	ok: z.literal(true),
	entry: z.string(),
	version: z.string(),
	from: entryStateSchema,
	to: entryStateSchema,
	gates: gateVerdictSchema,
	recorded: z.number(),
});

const closed = (
	entry: IRoadmapEntry,
	to: IRoadmapEntryState,
	reason: string | undefined,
	supersededBy: string | undefined,
): IRoadmapEntry => ({
	...entry,
	state: to,
	...(supersededBy === undefined ? {} : { supersededBy }),
	...(reason === undefined ? {} : { note: reason }),
});

export const buildRoadmapPlanCloseTool = (
	options: IRoadmapToolOptions,
): IToolRegistration => ({
	id: 'roadmap_plan_close',
	tags: ['roadmap', 'write'],
	effects: ['write'],
	writeRoot: 'caller-checkout',
	register: async (server) => {
		server.registerTool(
			`${options.namespacePrefix}_roadmap_plan_close`,
			{
				description:
					'Close one roadmap entry as delivered, deferred, dropped or superseded, and record it in the timeline. Delivered needs every gate passing, or a `reason` saying why it is delivered without them; the other three always need a `reason`. Writes the roadmap and timeline files only.',
				inputSchema: INPUT,
				outputSchema: OUTPUT,
			},
			async (args) => {
				const parsed = INPUT.safeParse(args);
				if (!parsed.success)
					return invalidArguments(parsed.error.issues);
				const {
					entry: entryId,
					to,
					reason,
					supersededBy,
				} = parsed.data;
				const loaded = await loadRoadmap(options.workspace());
				if (!loaded.ok) return loaded.error;
				const detail = entryDetail(loaded.roadmap, entryId);
				if (detail === undefined) {
					return toolError(
						`the roadmap has no entry ${entryId}`,
						'Use roadmap_show to list the ids there are.',
						'unknown-entry',
					);
				}
				const gates = evaluateEntryGates(detail.entry, loaded.evidence);
				if (
					reason === undefined &&
					(to !== 'delivered' || gates.status !== 'pass')
				) {
					return toolError(
						to === 'delivered'
							? `${entryId} is not closed as delivered on silence: its gates answer ${gates.status} (${gates.reason})`
							: `closing ${entryId} as ${to} needs the reason it will not ship as promised`,
						'Pass `reason`; the timeline keeps it.',
						'reason-required',
					);
				}
				if ((to === 'superseded') !== (supersededBy !== undefined)) {
					return toolError(
						to === 'superseded'
							? `superseding ${entryId} needs the entry that replaces it`
							: '`supersededBy` only goes with `to: superseded`',
						'Pass `supersededBy` with the replacing entry id, and only then.',
						'superseded-by',
					);
				}
				const from = detail.entry.state;
				const legal = checkTransition(from, to);
				if (!legal.ok) {
					return toolError(
						legal.reason,
						'Nothing was written.',
						'illegal-transition',
					);
				}
				const changed = await recordChange(
					options,
					(roadmap) => ({
						ok: true,
						value: {
							...roadmap,
							horizons: roadmap.horizons.map((horizon) => ({
								...horizon,
								entries: horizon.entries.map((each) =>
									each.id === entryId
										? closed(each, to, reason, supersededBy)
										: each,
								),
							})),
						},
					}),
					reason ?? gates.reason,
					parsed.data.actor,
				);
				if (!changed.ok) {
					return toolError(
						changed.reason,
						'Nothing was written.',
						'plan-close-refused',
					);
				}
				return toolJson(
					OUTPUT.parse({
						ok: true,
						entry: entryId,
						version: detail.version,
						from,
						to,
						gates,
						recorded: changed.value.recorded,
					}),
				);
			},
		);
	},
});
