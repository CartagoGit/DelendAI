import z from 'zod';

import type { IToolRegistration, IToolTextResult } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import { collectFromTestJournal } from '../collectors/test-journal.service';
import {
	appendObservations,
	queryObservations,
} from '../store/observation-store.service';
import type { IObservationKind } from '../contracts/interfaces/observation.interface';
import type { IObservationsToolOptions } from '../contracts/interfaces/observations-tool.interface';

export type { IObservationsToolOptions } from '../contracts/interfaces/observations-tool.interface';

/** Most a caller may ask for at once: past this it wants the file. */
const MAX_PAGE = 200;

/** What a caller gets when it does not say. Enough to see a pattern. */
const DEFAULT_PAGE = 50;

/**
 * `self_learning_observations` — what this project has already shown us.
 *
 * One tool, two verbs, because they are the same question asked at two
 * moments: `collect` folds whatever the runtime has written since last
 * time into the store, and the read that follows answers from it. An
 * agent that only ever reads gets a stale answer; one that only ever
 * collects learns nothing.
 *
 * Read-mostly and cheap: no LLM, no network, no new instrumentation.
 * The collectors read artefacts the project already produces.
 */
export const buildObservationsToolRegistration = (
	options: IObservationsToolOptions,
): IToolRegistration => {
	const storeOptions = {
		filePath: options.storePathAbs,
		readText: options.readText,
		...(options.maxObservations !== undefined
			? { maxObservations: options.maxObservations }
			: {}),
		...(options.workspaceRootAbs !== undefined
			? { workspaceRoot: options.workspaceRootAbs }
			: {}),
	};

	return {
		id: 'observations',
		summary:
			'What this project has already taught us: collected observations, filtered.',
		tags: ['self-learning', 'observability', 'lazy'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_observations`,
				{
					description:
						'Read what this project has already shown us — test failures, command outcomes, refusals — collected from artefacts the runtime already writes (no new instrumentation, no network). Set `collect:true` to fold in anything new before answering. Filter by `kind`, `subject` or `sinceMs`; results are newest first.',
					inputSchema: z.object({
						collect: z.boolean().optional(),
						kind: z
							.enum([
								'command-outcome',
								'test-failure',
								'tool-confusion',
								'refusal',
								'slice-outcome',
							])
							.optional(),
						subject: z.string().min(1).optional(),
						sinceMs: z.number().int().nonnegative().optional(),
						limit: z
							.number()
							.int()
							.positive()
							.max(MAX_PAGE)
							.optional(),
					}),
					outputSchema: z.object({
						collected: z.number(),
						skipped: z.number(),
						total: z.number(),
						observations: z.array(
							z.object({
								kind: z.string(),
								subject: z.string(),
								outcome: z.string(),
								atMs: z.number(),
								source: z.string(),
								detail: z.string().optional(),
							}),
						),
					}),
				},
				async (args: {
					collect?: boolean | undefined;
					kind?: IObservationKind | undefined;
					subject?: string | undefined;
					sinceMs?: number | undefined;
					limit?: number | undefined;
				}): Promise<IToolTextResult> => {
					let collected = 0;
					let skipped = 0;
					if (args.collect === true) {
						const incoming = await collectFromTestJournal(
							options.testJournalPathAbs,
							options.readText,
						);
						const written = await appendObservations(
							storeOptions,
							incoming,
						);
						collected = written.appended;
						skipped = written.skipped;
					}

					const observations = await queryObservations(storeOptions, {
						...(args.kind !== undefined ? { kind: args.kind } : {}),
						...(args.subject !== undefined
							? { subject: args.subject }
							: {}),
						...(args.sinceMs !== undefined
							? { sinceMs: args.sinceMs }
							: {}),
						limit: args.limit ?? DEFAULT_PAGE,
					});

					return toolJson({
						collected,
						skipped,
						total: observations.length,
						observations,
					});
				},
			);
		},
	};
};
