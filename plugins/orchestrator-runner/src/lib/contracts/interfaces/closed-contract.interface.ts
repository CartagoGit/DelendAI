/**
 * closed-contract.interface.ts — the one template a worker is handed.
 *
 * Every section is required: a contract missing one is refused, never
 * rendered with a gap the worker would fill by guessing.
 */

/** What a worker is told, section by section. */
export interface IClosedContract {
	/** What it is to achieve. */
	readonly objective: string;
	/** The only files it may change. */
	readonly authorizedFiles: readonly string[];
	/** The interfaces and behaviour expected of the result. */
	readonly interfaces: readonly string[];
	/** Rules that must hold whatever it changes. */
	readonly invariants: readonly string[];
	/** What it relies on being there already. */
	readonly dependencies: readonly string[];
	/** The checks the result must pass. */
	readonly acceptance: readonly string[];
	/** The exact test commands to run. */
	readonly tests: readonly string[];
	/** Its token budget and call, turn and retry limits. */
	readonly budget: {
		readonly tokens: number;
		readonly calls: number;
		readonly turns: number;
		readonly retries: number;
	};
	/** When it stops and reports a blocker instead of going on. */
	readonly stopConditions: readonly string[];
	/** The one isolated unit this contract is bound to. */
	readonly unit: string;
}

/** A contract rendered, or the sections that kept it from being. */
export type IClosedContractResult =
	| { readonly ok: true; readonly prompt: string }
	| { readonly ok: false; readonly missing: readonly string[] };
