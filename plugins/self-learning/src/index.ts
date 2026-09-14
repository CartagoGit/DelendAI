import {
	definePlugin,
	joinRel,
	resolveWorkspaceContained,
	SafeWorkspaceReader,
} from '@delendai/core/public';
import z from 'zod';

import { buildObservationsToolRegistration } from './lib/tools/observations.tool';

/**
 * `@delendai/self-learning` — what this project has already taught us
 * (q00014 S4).
 *
 * DelendAI measures a great deal and learns nothing: every session, an
 * agent rediscovers which commands work on this machine, which specs
 * break together, and which refusals it is about to trip. The evidence
 * was always there — the test failure journal, the usage log, the
 * engine's own refusals — and nothing read it back.
 *
 * This plugin is the store for that evidence, per project, and the one
 * collector that needs no new instrumentation: the test journal q00014
 * S2 already writes. It adds NO measurement of its own.
 *
 *   delendai --plugins=self-learning
 *
 * Opt-in on purpose, and absent from every preset. What it accumulates
 * is cheap but it is still a file in somebody's repository, and a
 * project that has not asked to be observed should not be.
 *
 * Nothing here leaves the machine. The store lives under
 * `<cacheDir>/self-learning/` and is bounded; `error-reporting` remains
 * the only component that sends anything anywhere, with its privacy
 * validator intact.
 */
export default definePlugin({
	name: 'self-learning',
	version: '0.1.0',
	describe:
		'Accumulates observations the runtime already produces (test failures, command outcomes) per project and answers what this project has taught us. Opt-in; nothing leaves the machine.',
	optionsSchema: z.object({
		/** Workspace-relative store path. Default `<cacheDir>/self-learning/observations.jsonl`. */
		storePath: z.string().optional(),
		/** Workspace-relative test journal. Default the q00014 S2 path. */
		testJournalPath: z.string().optional(),
		/** Observations retained before the oldest are dropped. */
		maxObservations: z.number().int().positive().optional(),
	}),
	register(ctx) {
		const storeRel =
			typeof ctx.options.storePath === 'string'
				? ctx.options.storePath
				: joinRel(ctx.pluginCacheDir, 'observations.jsonl');
		const journalRel =
			typeof ctx.options.testJournalPath === 'string'
				? ctx.options.testJournalPath
				: joinRel(ctx.cacheDir, 'results/logs/test-runs.jsonl');

		// Both paths are resolved through containment rather than joined:
		// an option is operator input, and a store that can be pointed at
		// somebody else's directory is a worse problem than no store.
		const store = resolveWorkspaceContained(ctx.workspace.root, storeRel);
		if (!store.ok) {
			throw new Error(
				`self-learning: invalid storePath: ${store.reason ?? storeRel}`,
			);
		}
		const journal = resolveWorkspaceContained(
			ctx.workspace.root,
			journalRel,
		);
		if (!journal.ok) {
			throw new Error(
				`self-learning: invalid testJournalPath: ${journal.reason ?? journalRel}`,
			);
		}

		const maxObservations =
			typeof ctx.options.maxObservations === 'number'
				? ctx.options.maxObservations
				: undefined;

		// Every read goes through the host's reader, which is what keeps a
		// path option from becoming a read of somebody else's directory.
		// A missing file is `null`, never an exception: an absent store is
		// the normal state of a project that has not learned anything yet.
		const reader = new SafeWorkspaceReader(ctx.workspace.root);
		const readText = async (path: string): Promise<string | null> => {
			try {
				return (await reader.readText(path)).content;
			} catch {
				return null;
			}
		};

		return {
			tools: [
				buildObservationsToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					storePathAbs: store.abs,
					testJournalPathAbs: journal.abs,
					readText,
					...(maxObservations !== undefined
						? { maxObservations }
						: {}),
				}),
			],
		};
	},
});
