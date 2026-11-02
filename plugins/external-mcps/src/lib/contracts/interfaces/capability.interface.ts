/**
 * capability.interface.ts — what an agent asks an external server for,
 * named by what it does rather than by the product that does it.
 */
import type { IToolEffect } from '@delendai/core/contracts';

/** The capabilities delendai knows how to carry the project into. */
export type ICapabilityName =
	| 'design.read'
	| 'design.tokens'
	| 'browser.inspect'
	| 'browser.screenshot'
	| 'database.query'
	| 'database.write';

export interface ICapability {
	readonly name: ICapabilityName;
	/** Core's effect vocabulary: what calling it can do beyond reading. */
	readonly effects: readonly IToolEffect[];
	/** Whether its answer becomes code in the project, so the contract travels with it. */
	readonly shapesCode: boolean;
	readonly summary: string;
}
