import z from 'zod';

import type { IToolRegistration, IToolTextResult } from '@delendai/core/public';
import { toolJson } from '@delendai/core/public';

import { adviseFor, deriveLessons } from '../lessons/derive-lessons.helper';
import { readObservations } from '../store/observation-store.service';
import type { IObservationsToolOptions } from '../contracts/interfaces/observations-tool.interface';

/** Most a caller may ask for at once. */
const MAX_PAGE = 50;

/** What a caller gets when it does not say. */
const DEFAULT_PAGE = 10;

/**
 * `self_learning_lessons` — what this project has taught us, and what
 * that means for what you are about to do (q00014 S5).
 *
 * One tool, two questions, because they share every input and differ
 * only in the filter: with no `goal` it answers "what do we know about
 * this project", with one it answers "what bears on this". Splitting
 * them into two tools would publish the same schema twice on a surface
 * the token budgets are already fighting over.
 *
 * Each lesson carries its evidence and a confidence that can fall — a
 * claim nothing recent supports, or one the project keeps contradicting,
 * degrades on its own rather than waiting for somebody to notice. A
 * pattern under the support threshold is not reported at all: a store of
 * coincidences is worse than no store, because a reader cannot tell
 * which half to believe and stops reading both.
 */
export const buildLessonsToolRegistration = (
	options: IObservationsToolOptions,
): IToolRegistration => {
	const storeOptions = {
		filePath: options.storePathAbs,
		readText: options.readText,
		...(options.maxObservations !== undefined
			? { maxObservations: options.maxObservations }
			: {}),
	};

	return {
		id: 'lessons',
		summary:
			'What this project has taught us, with the evidence and a confidence that can fall.',
		tags: ['self-learning', 'observability', 'lazy'],
		register: async (server) => {
			server.registerTool(
				`${options.namespacePrefix}_lessons`,
				{
					description:
						'Ask what THIS project has already taught us — which commands fail here, which specs are fragile, which refusals keep happening — derived from observations the runtime already wrote. Pass `goal` to get only what bears on what you are about to do. Every lesson carries the observations behind it and a confidence that falls when nothing recent supports it or the project contradicts it; a pattern with too little support is not reported at all. No LLM, no network, nothing leaves the machine.',
					inputSchema: z.object({
						goal: z.string().min(1).optional(),
						limit: z
							.number()
							.int()
							.positive()
							.max(MAX_PAGE)
							.optional(),
						minimumSupport: z.number().int().positive().optional(),
					}),
					outputSchema: z.object({
						total: z.number(),
						lessons: z.array(
							z.object({
								kind: z.string(),
								subject: z.string(),
								claim: z.string(),
								confidence: z.object({
									score: z.number(),
									band: z.string(),
									support: z.number(),
									counterExamples: z.number(),
									recentSupport: z.number(),
								}),
								lastSeenMs: z.number(),
								evidenceCount: z.number(),
							}),
						),
					}),
				},
				async (args: {
					goal?: string | undefined;
					limit?: number | undefined;
					minimumSupport?: number | undefined;
				}): Promise<IToolTextResult> => {
					const observations = await readObservations(storeOptions);
					const all = deriveLessons(observations, {
						...(args.minimumSupport !== undefined
							? { minimumSupport: args.minimumSupport }
							: {}),
					});
					const matched =
						args.goal === undefined
							? all
							: adviseFor(args.goal, all);

					// The evidence is COUNTED here rather than returned:
					// it is what makes a claim checkable, and it is also
					// the part that grows without bound. A caller that
					// wants the observations themselves asks the
					// observations tool, which is built to page them.
					return toolJson({
						total: matched.length,
						lessons: matched
							.slice(0, args.limit ?? DEFAULT_PAGE)
							.map((lesson) => ({
								kind: lesson.kind,
								subject: lesson.subject,
								claim: lesson.claim,
								confidence: {
									score: lesson.confidence.score,
									band: lesson.confidence.band,
									support: lesson.confidence.support,
									counterExamples:
										lesson.confidence.counterExamples,
									recentSupport:
										lesson.confidence.recentSupport,
								},
								lastSeenMs: lesson.lastSeenMs,
								evidenceCount: lesson.evidence.length,
							})),
					});
				},
			);
		},
	};
};
