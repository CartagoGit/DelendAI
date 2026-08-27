/**
 * Resolves the `IDispatchPort` the plugin dispatches subagents through.
 *
 * Evidence (see `LinearDispatcher#runStep` + `FakeDispatchPort`): an
 * empty-script `FakeDispatchPort` does NOT fail closed — its
 * `fallback()` response (`ok`, `schemaOk: true`, `hadError: false`)
 * reads as three clean, identical iterations to `LoopDetector`
 * (`repeated-output` only fires on an A,B,A pattern, never on A,A,A),
 * so the step is marked `ok: true` and the plan reports success. A
 * production host that forgets to inject a real `portFactory` would
 * therefore have every `_dispatch` call silently *fabricate* success
 * instead of failing closed.
 *
 * The fix: the fake port stays available, but only for an explicit,
 * named opt-in (`allowFakeDispatchPort`) meant for tests/fixtures.
 * Any other missing-or-invalid port configuration throws at register
 * time, so the host sees a loud, structured error instead of a
 * quietly-fabricated plan.
 */
import { FakeDispatchPort } from './fake-port.js';
import type { IDispatchPort } from './contracts.js';
import type { IResolveDispatchPortOptions } from '../contracts/interfaces/agent-orchestrator.interface.js';

export class MissingDispatchPortError extends Error {
	constructor() {
		super(
			'agent-orchestrator requires a real `portFactory` (producing an ' +
				'IDispatchPort) to dispatch subagents. Without one, `_dispatch` ' +
				'would silently fabricate success instead of running anything. ' +
				'Pass `allowFakeDispatchPort: true` only for tests/fixtures.',
		);
		this.name = 'MissingDispatchPortError';
	}
}

export class InvalidDispatchPortFactoryError extends Error {
	constructor(reason: string) {
		super(
			`\`portFactory\` did not produce a usable IDispatchPort: ${reason}`,
		);
		this.name = 'InvalidDispatchPortFactoryError';
	}
}

function isDispatchPort(value: unknown): value is IDispatchPort {
	return (
		typeof value === 'object' &&
		value !== null &&
		typeof (value as { spawnSubagent?: unknown }).spawnSubagent ===
			'function'
	);
}

/**
 * Resolve the port to dispatch through, or throw a descriptive error.
 * Never silently substitutes the fake port for a missing or broken
 * `portFactory` — see the module doc for why that would be dangerous.
 */
export function resolveDispatchPort(
	opts: IResolveDispatchPortOptions,
): IDispatchPort {
	if (typeof opts.portFactory === 'function') {
		let candidate: unknown;
		try {
			candidate = opts.portFactory();
		} catch (err) {
			throw new InvalidDispatchPortFactoryError(
				err instanceof Error ? err.message : String(err),
			);
		}
		if (!isDispatchPort(candidate)) {
			throw new InvalidDispatchPortFactoryError(
				'the returned value has no spawnSubagent() function',
			);
		}
		return candidate;
	}
	if (opts.portFactory !== undefined) {
		throw new InvalidDispatchPortFactoryError(
			'`portFactory` must be a function that returns an IDispatchPort',
		);
	}
	if (opts.allowFakeDispatchPort === true) {
		return new FakeDispatchPort();
	}
	throw new MissingDispatchPortError();
}
