/**
 * forge-event-catch-up.ts — a host that was offline tells its sessions what
 * they missed, once.
 *
 * On each (re)connection the forge is asked ONCE about the pull requests
 * sessions wait on. Each answer an earlier delivery did not already cover
 * is delivered and remembered; a second reconnect with nothing new delivers
 * nothing. The cursor is written after the delivery, so a host that dies
 * between the two tells again rather than never.
 */

import type {
	IForgeCatchUpEvent,
	IForgeCatchUpInput,
	IForgeCatchUpTarget,
} from '../contracts/interfaces/forge-catch-up.interface';

/** The fact an event states, so the same truth is never told twice. Pure. */
export const forgeEventKey = (event: IForgeCatchUpEvent): string =>
	[
		event.kind,
		event.change,
		event.label,
		event.check,
		event.conclusion,
		event.sha,
	]
		.map((part) => part ?? '')
		.join('|');

const targetOf = (
	event: IForgeCatchUpEvent,
): IForgeCatchUpTarget | undefined =>
	event.number === undefined
		? undefined
		: { repository: event.repository, number: event.number };

/** Ask the forge once and deliver what is new; returns how many were. */
export const catchUpForgeEvents = async (
	input: IForgeCatchUpInput,
): Promise<number> => {
	const targets = await input.targets();
	if (targets.length === 0) return 0;
	let told = 0;
	const seen = new Map<string, readonly string[]>();
	for (const event of await input.source.missed(targets)) {
		const target = targetOf(event);
		if (target === undefined) continue;
		const id = `${target.repository}#${String(target.number)}`;
		const known = seen.get(id) ?? (await input.cursor.delivered(target));
		const key = forgeEventKey(event);
		if (known.includes(key)) {
			seen.set(id, known);
			continue;
		}
		await input.deliver(event);
		await input.cursor.mark(target, key);
		seen.set(id, [...known, key]);
		told += 1;
	}
	return told;
};
