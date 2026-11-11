/**
 * forge-event-normaliser.spec.ts — a delivery becomes forge-neutral events,
 * and one that fits none is dropped with a counted reason, never thrown.
 *
 * The adapter here is a fake forge with its own vocabulary, so the claim
 * "an adapter needs no change elsewhere" is tested with a forge that is not
 * GitHub.
 */

import { describe, expect, it } from 'vitest';

import { FORGE_EVENT_KINDS } from '../src/lib/contracts/constants/forge-event.constant';
import { createForgeEventNormaliser } from '../src/lib/services/forge-event-normaliser';

import type {
	IForgeEvent,
	IForgeEventAdapter,
	IForgeEventDelivery,
} from '../src/lib/contracts/interfaces/forge-event-port.interface';

/** A forge that names its events in a header and its PRs "merge requests". */
const fakeForge: IForgeEventAdapter = {
	forge: 'fake',
	verify: () => true,
	eventName: (delivery) => delivery.headers['x-fake-event'],
	map: (name, payload) => {
		const body = payload as { action?: string; iid?: number };
		if (name === 'merge_request' && body.action === 'open')
			return {
				events: [
					{ kind: 'pr.opened', repository: 'o/r', number: body.iid },
				],
			};
		if (name === 'explode') throw new Error('adapter bug');
		// An adapter that passes through what a payload claims, so a kind
		// this port does not declare can reach the normaliser as data.
		if (name === 'echo')
			return { events: (payload as { events: IForgeEvent[] }).events };
		return { dropped: `unmapped:${name}` };
	},
};

const delivery = (event: string, body: string): IForgeEventDelivery => ({
	headers: { 'x-fake-event': event },
	body,
});

describe('createForgeEventNormaliser', () => {
	it('[<5ms] declares the twelve normalised kinds, push and comments included', () => {
		expect([...FORGE_EVENT_KINDS]).toEqual([
			'pr.opened',
			'pr.updated',
			'pr.ready',
			'pr.merged',
			'pr.closed',
			'check.completed',
			'review.submitted',
			'issue.opened',
			'issue.updated',
			'issue.closed',
			'branch.pushed',
			'pr.commented',
		]);
	});

	it('[<5ms] maps a delivery of another forge to a neutral event', () => {
		const normaliser = createForgeEventNormaliser(fakeForge);
		expect(
			normaliser.normalise(
				delivery('merge_request', '{"action":"open","iid":7}'),
			),
		).toEqual([{ kind: 'pr.opened', repository: 'o/r', number: 7 }]);
		expect(normaliser.drops()).toEqual({});
	});

	it('[<5ms] counts every kind of drop and throws for none', () => {
		const normaliser = createForgeEventNormaliser(fakeForge);
		expect(
			normaliser.normalise(delivery('merge_request', '{not json')),
		).toEqual([]);
		expect(normaliser.normalise({ headers: {}, body: '{}' })).toEqual([]);
		expect(normaliser.normalise(delivery('explode', '{}'))).toEqual([]);
		expect(normaliser.normalise(delivery('wiki', '{}'))).toEqual([]);
		expect(normaliser.normalise(delivery('wiki', '{}'))).toEqual([]);
		expect(normaliser.drops()).toEqual({
			'malformed-payload': 1,
			'unnamed-delivery': 1,
			'adapter-failed': 1,
			'unmapped:wiki': 2,
		});
	});

	it('[<5ms] keeps declared kinds and counts an undeclared one', () => {
		const normaliser = createForgeEventNormaliser(fakeForge);
		const body = JSON.stringify({
			events: [
				{ kind: 'pr.opened', repository: 'o/r' },
				{ kind: 'pr.teleported', repository: 'o/r' },
			],
		});
		expect(normaliser.normalise(delivery('echo', body))).toEqual([
			{ kind: 'pr.opened', repository: 'o/r' },
		]);
		expect(normaliser.drops()).toEqual({ 'undeclared-kind': 1 });
	});

	it('[<5ms] counts a drop decided outside it', () => {
		const normaliser = createForgeEventNormaliser(fakeForge);
		normaliser.count('signature-refused');
		expect(normaliser.drops()).toEqual({ 'signature-refused': 1 });
	});
});
