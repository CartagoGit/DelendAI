/**
 * forge-event-catch-up.service.ts — what the host does when its forge
 * connection comes up: it asks the forge once what sessions missed while no
 * host listened, and writes each fact to the shared store, where every
 * server's notification bridge tells the subscribed sessions.
 *
 * The cursor (core's store) remembers what was delivered, live events
 * included, so a second reconnect with nothing new delivers nothing.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import {
	appendForgeEventRecord,
	catchUpForgeEvents,
	forgeEventKey,
	forgeCursorTarget,
	markForgeEventDelivered,
	readForgeEventCursor,
	readForgeEventSubscriptions,
} from '@delendai/core/runtime';
import { createGitHubCatchUpSource } from '@delendai/github';

import type {
	IForgeCatchUpEvent,
	IForgeCatchUpSource,
} from '@delendai/core/runtime';
import type { IGitHubCatchUpRun } from '@delendai/github';

/** `gh`, read-only here: the source only ever views and lists checks. */
const ghRun: IGitHubCatchUpRun = async (args) => {
	try {
		const { stdout } = await promisify(execFile)('gh', [...args]);
		return { stdout };
	} catch (error) {
		// `gh pr checks` exits non-zero while a check fails; its output still counts.
		const stdout = (error as { stdout?: unknown }).stdout;
		return { stdout: typeof stdout === 'string' ? stdout : '' };
	}
};

/** The catch-up source of a forge the host can read, or none. */
export const forgeCatchUpSourceFor = (
	provider: string,
	labels: readonly string[],
	run: IGitHubCatchUpRun = ghRun,
): IForgeCatchUpSource | undefined =>
	provider === 'github'
		? createGitHubCatchUpSource({ run, labels })
		: undefined;

export interface IHostCatchUp {
	/** Ask the forge once and store what is new; returns how many facts. */
	readonly catchUp: () => Promise<number>;
	/** Remember a live event as delivered, so a later catch-up skips it. */
	readonly noteLive: (event: IForgeCatchUpEvent) => Promise<void>;
}

export const createHostCatchUp = (input: {
	/** The shared forge events store. */
	readonly dir: string;
	readonly repository: string;
	readonly source: IForgeCatchUpSource;
	readonly now?: (() => number) | undefined;
}): IHostCatchUp => ({
	catchUp: () =>
		catchUpForgeEvents({
			source: input.source,
			targets: async () => {
				const seen = new Set<string>();
				return (await readForgeEventSubscriptions(input.dir)).filter(
					(subscription) => {
						const id = forgeCursorTarget(
							subscription.repository,
							subscription.number,
						);
						if (
							subscription.repository !== input.repository ||
							seen.has(id)
						)
							return false;
						seen.add(id);
						return true;
					},
				);
			},
			cursor: {
				delivered: async (target) =>
					(await readForgeEventCursor(input.dir))[
						forgeCursorTarget(target.repository, target.number)
					] ?? [],
				mark: (target, key) =>
					markForgeEventDelivered(
						input.dir,
						forgeCursorTarget(target.repository, target.number),
						key,
					),
			},
			deliver: async (event) => {
				await appendForgeEventRecord(input.dir, event, input.now?.());
			},
		}),
	noteLive: async (event) => {
		if (event.number === undefined) return;
		await markForgeEventDelivered(
			input.dir,
			forgeCursorTarget(event.repository, event.number),
			forgeEventKey(event),
		);
	},
});
