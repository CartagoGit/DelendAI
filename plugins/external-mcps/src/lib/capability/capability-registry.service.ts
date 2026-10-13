/**
 * capability-registry.service.ts — which capability a call names, and
 * whether its effects need a person's ack before it runs.
 *
 * A destructive capability is gated by the ack the plugin already keeps
 * for activations, keyed off the same effect vocabulary the dry-run
 * protocol reads: no second gate is invented here.
 */
import { CAPABILITIES } from '../contracts/constants/capability-registry.constant';
import type { ICapability } from '../contracts/interfaces/capability.interface';

export { CAPABILITY_NAMES } from '../contracts/constants/capability-registry.constant';

/** The capability of that name, or `undefined` for one nobody declared. */
export const capabilityOf = (name: string): ICapability | undefined =>
	CAPABILITIES.find((capability) => capability.name === name);

/** A destructive capability runs only after a person acked its server. */
export const capabilityNeedsAck = (capability: ICapability): boolean =>
	capability.effects.includes('destructive');
