/**
 * close-actor.interface.ts — the contract behind
 * `../../swarm/close-actor.resolver.ts`.
 */
export type ICloseActorSource =
	| 'argument'
	| 'environment'
	| 'work-ref'
	| 'none';

/** The unit a checkout is on, as its work ref names it. */
export interface IUnitOwner {
	readonly agent: string;
	readonly proposal: string;
	readonly slice: string;
	readonly branch: string;
}

export interface ICloseActor {
	readonly agent: string | undefined;
	readonly source: ICloseActorSource;
	/** The unit the checkout is on, when it is a work unit. */
	readonly unit: IUnitOwner | undefined;
	/** True when `unit` is this actor's own, for the slice being closed. */
	readonly ownsUnit: boolean;
}
