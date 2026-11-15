/**
 * rehearsal-receive.helper.ts — the receiver a rehearsal connects after the
 * pull requests changed while none ran: the host's own catch-up, driven by
 * the harness against the harness forge.
 */
import {
	catchUpForgeEvents,
	type IForgeCatchUpCursor,
	type IForgeCatchUpEvent,
} from '@delendai/core/runtime';

import type {
	IRehearsalClock,
	IRehearsalRunContext,
	IScenarioState,
} from '../contracts/interfaces/rehearsal.interface';

const isoOf = (clock: IRehearsalClock): string =>
	new Date(clock.now()).toISOString();

/** The repository name a rehearsal's catch-up targets carry; the harness forge has one. */
const RECEIVER_REPOSITORY = 'rehearsal';

/** What changed on the pull requests `numbers`, as the harness forge shows it now. */
const missedOn = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
	numbers: ReadonlySet<number>,
): Promise<readonly IForgeCatchUpEvent[]> => {
	const events: IForgeCatchUpEvent[] = [];
	for (const pull of await ctx.forge.pulls(state.integration)) {
		if (!numbers.has(pull.number)) continue;
		const base = {
			repository: RECEIVER_REPOSITORY,
			number: pull.number,
			sha: pull.headSha,
		};
		if (pull.mergedAt !== undefined)
			events.push({ ...base, kind: 'pr.merged' });
		else if (pull.state === 'closed')
			events.push({ ...base, kind: 'pr.closed' });
		for (const label of pull.labels)
			events.push({
				...base,
				kind: 'pr.updated',
				change: 'labelled',
				label,
			});
	}
	return events;
};

/**
 * A receiver connects twice: the host's catch-up asks the forge once each
 * time, and a session subscribed to the pull requests is told each missed
 * fact once, so the second connection tells nothing.
 */
export const receive = async (
	ctx: IRehearsalRunContext,
	state: IScenarioState,
	keys: readonly string[],
): Promise<void> => {
	const subscribed = new Set(
		keys.flatMap((key) => {
			const number = state.numbers.get(key);
			return number === undefined ? [] : [number];
		}),
	);
	const told = new Map<number, string[]>();
	const cursor: IForgeCatchUpCursor = {
		delivered: (target) => Promise.resolve(told.get(target.number) ?? []),
		mark: (target, key) => {
			told.set(target.number, [...(told.get(target.number) ?? []), key]);
			return Promise.resolve();
		},
	};
	const receipts = state.notifications ?? [];
	state.notifications = receipts;
	for (let connection = 0; connection < 2; connection += 1)
		await catchUpForgeEvents({
			source: { missed: () => missedOn(ctx, state, subscribed) },
			cursor,
			targets: () =>
				Promise.resolve(
					[...subscribed].map((number) => ({
						repository: RECEIVER_REPOSITORY,
						number,
					})),
				),
			deliver: (event) => {
				receipts.push({
					event: event.kind,
					at: isoOf(ctx.clock),
					...(event.number === undefined
						? {}
						: { number: event.number }),
				});
			},
		});
};
