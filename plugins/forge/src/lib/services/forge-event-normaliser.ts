/**
 * forge-event-normaliser.ts — one delivery in, normalised events out, and
 * every delivery that made none counted by its reason.
 *
 * The forge-neutral half of reading a delivery: parse the body once, ask the
 * adapter for the event's name and mapping, and keep only kinds the port
 * declares. Nothing here throws on a delivery: a forge that starts sending a
 * new payload is a count to read, not a receiver to restart.
 */

import {
	FORGE_EVENT_DROP_REASONS,
	FORGE_EVENT_KINDS,
} from '../contracts/constants/forge-event.constant';

import type {
	IForgeEvent,
	IForgeEventAdapter,
	IForgeEventDelivery,
	IForgeEventMapping,
	IForgeEventNormaliser,
} from '../contracts/interfaces/forge-event-port.interface';

const DECLARED_KINDS: ReadonlySet<string> = new Set(FORGE_EVENT_KINDS);

const parse = (body: string): { readonly payload: unknown } | undefined => {
	try {
		return { payload: JSON.parse(body) as unknown };
	} catch {
		return undefined;
	}
};

const mapSafely = (
	adapter: IForgeEventAdapter,
	name: string,
	payload: unknown,
): IForgeEventMapping => {
	try {
		return adapter.map(name, payload);
	} catch {
		return { dropped: FORGE_EVENT_DROP_REASONS.adapterFailed };
	}
};

export const createForgeEventNormaliser = (
	adapter: IForgeEventAdapter,
): IForgeEventNormaliser => {
	const drops = new Map<string, number>();
	const count = (reason: string): void => {
		drops.set(reason, (drops.get(reason) ?? 0) + 1);
	};

	const normalise = (
		delivery: IForgeEventDelivery,
	): readonly IForgeEvent[] => {
		const parsed = parse(delivery.body);
		if (parsed === undefined) {
			count(FORGE_EVENT_DROP_REASONS.malformedPayload);
			return [];
		}
		const name = adapter.eventName(delivery);
		if (name === undefined) {
			count(FORGE_EVENT_DROP_REASONS.unnamedDelivery);
			return [];
		}
		const mapping = mapSafely(adapter, name, parsed.payload);
		if ('dropped' in mapping) {
			count(mapping.dropped);
			return [];
		}
		const declared = mapping.events.filter((event) =>
			DECLARED_KINDS.has(event.kind),
		);
		for (let i = declared.length; i < mapping.events.length; i += 1)
			count(FORGE_EVENT_DROP_REASONS.undeclaredKind);
		return declared;
	};

	return {
		normalise,
		count,
		drops: () => Object.fromEntries(drops),
	};
};
