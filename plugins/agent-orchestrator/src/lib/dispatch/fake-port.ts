/**
 * Deterministic `IDispatchPort` for tests. The host injects a
 * sequence of scripted responses; the port emits them in order,
 * keyed by `slotId` so multi-step plans can have per-step scripts.
 *
 * Production code never imports this — it lives under `lib/` and
 * is exported via `public/` only so unit tests + the smoke can
 * drive scenarios without touching real agents.
 */
import type { IDispatchPort, ISubagentResult } from './contracts.js';
import type { IPlanStep, SubagentRole } from '../policy/types.js';

/**
 * Script for one subagent invocation. The slot script is matched by
 * `slotId` (step.order + role); if no slot script exists, the port
 * falls back to the global default.
 */
export interface IFakeScriptStep {
	/** Returned for this iteration of the slot. */
	readonly output: string;
	readonly tokensUsed: number;
	readonly schemaOk: boolean;
	readonly hadError: boolean;
	/** When `true`, throw this message instead of returning. */
	readonly throw?: string;
}

export type IFakeScript = ReadonlyMap<string, readonly IFakeScriptStep[]> & {
	readonly defaultResponse?: IFakeScriptStep;
};

export interface IFakeDispatchPortDeps {
	readonly script?: IFakeScript;
}

export class FakeDispatchPort implements IDispatchPort {
	readonly #script: IFakeScript;
	readonly #cursor = new Map<string, number>();

	constructor(deps: IFakeDispatchPortDeps = {}) {
		this.#script = deps.script ?? new Map();
	}

	async spawnSubagent(input: {
		readonly role: SubagentRole;
		readonly instruction: string;
		readonly step: IPlanStep;
		readonly budget: number;
		readonly slotId: string;
	}): Promise<ISubagentResult> {
		const slotId = input.slotId;
		const queue = this.#script.get(slotId);
		const cursor = this.#cursor.get(slotId) ?? 0;
		const step: IFakeScriptStep | undefined =
			queue && cursor < queue.length
				? queue[cursor]
				: (this.#script.defaultResponse ?? fallback());
		this.#cursor.set(slotId, cursor + 1);

		if (step?.throw !== undefined) {
			throw new Error(step.throw);
		}
		if (!step) {
			// Empty script ⇒ emit a clean response so the plan succeeds.
			return {
				subagentId: `${slotId}#default`,
				tokensUsed: 10,
				output: 'ok',
				schemaOk: true,
				hadError: false,
			};
		}
		return {
			subagentId: `${slotId}#${cursor}`,
			tokensUsed: step.tokensUsed,
			output: step.output,
			schemaOk: step.schemaOk,
			hadError: step.hadError,
		};
	}
}

function fallback(): IFakeScriptStep {
	return {
		output: 'ok',
		tokensUsed: 10,
		schemaOk: true,
		hadError: false,
	};
}
