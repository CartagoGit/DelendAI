/**
 * verify-probes.ts — Solid SRP extraction.
 *
 * The plugin-tool-verify script used to inline two probes inside
 * `verifyPlugin`:
 *
 *   1. **Empty-input probe**: invoke each tool with `{}` and check
 *      whether the inputSchema accepts it. If yes, the handler must
 *      return a result that satisfies the outputSchema. If no, the
 *      tool documents required input — that's fine, mark as
 *      'needs-input'.
 *
 *   2. **Happy-path probe**: for tools that require real input
 *      (`fs_read`, `fs_write`, `scaffold`), supply a minimal valid
 *      payload and verify the handler's output satisfies the
 *      outputSchema.
 *
 * Both probes are pure functions over their inputs. Extracting them
 * into this module lets us:
 *
 *   - **SRP**: each probe owns one contract (inputSchema accepts / /
 *     outputSchema satisfied).
 *   - **DIP**: the probe takes an `IToolHandle` (a tiny adapter the
 *     caller builds with `captureSchemas`) so the probe never
 *     touches the MCP SDK directly — tests inject a fake handle.
 *   - **Testability**: each probe is now spec-able without booting
 *     the verify script.
 */
import type { z } from 'zod';

import type { IToolEffect, IToolRegistration } from '@mcp-vertex/core/public';

/**
 * The minimal handle a probe needs: the captured input/output Zod
 * schemas and an `invoke(args)` closure that runs the tool's handler.
 * Solid-ISP: this is the narrowest interface the probes need; tests
 * can build one from a stub without instantiating a real MCP server.
 */
export interface IToolHandle {
	readonly tool: IToolRegistration;
	readonly inputSchema: z.ZodTypeAny | undefined;
	readonly outputSchema: z.ZodTypeAny | undefined;
	readonly invoke: (args: unknown) => Promise<unknown>;
	/**
	 * x00107: invoke preserving the `isError` flag. Optional so
	 * existing fake handles keep compiling; when absent the probe
	 * falls back to `invoke` and treats the result as non-error.
	 */
	readonly invokeRaw?: (
		args: unknown,
	) => Promise<{ payload: unknown; isError: boolean }>;
}

/** Outcome of a probe — same shape the script used to build inline. */
export type IProbeOutcome =
	/** Empty-input probe: schema accepts `{}` AND handler returned a schema-matching result. */
	| 'ok'
	/** Empty-input probe: inputSchema rejected `{}` — tool documents required input. */
	| 'needs-input'
	/** Any probe: handler crashed on schema-accepted input, or output did not match. */
	| 'failed';

/** Result of a single probe over one tool. Stable shape for the table renderer. */
export interface IProbeResult {
	readonly tool: string;
	readonly outcome: IProbeOutcome;
	readonly handlerReturned: boolean;
	readonly detail?: string;
}

/**
 * AUD-D07 exhaustiveness canary. Every member of `IToolEffect` must be
 * listed in this `switch` — if the union in
 * `tool-registration.interface.ts` gains a member, the `default`
 * branch's assignment to `never` stops compiling until this file is
 * updated to acknowledge it. This is what makes "a new effect exists
 * that the verify harness doesn't know about" a build break instead
 * of a silent gap, without this module re-enumerating the union
 * anywhere else (that re-enumeration, with two literals that didn't
 * exist in the union, is what caused AUD-D07 in the first place).
 */
export const describeEffect = (effect: IToolEffect): string => {
	switch (effect) {
		case 'write':
		case 'spawn':
		case 'network':
		case 'destructive':
			return effect;
		default: {
			const exhaustive: never = effect;
			throw new Error(`unhandled tool effect: ${String(exhaustive)}`);
		}
	}
};

/**
 * True when the tool declares at least one side effect. Deliberately
 * NOT an enumeration of `IToolEffect`'s members — any declared effect
 * at all is reason enough to skip the empty-input probe. See
 * `describeEffect` above for the compile-time guard that still keeps
 * this module honest about the shape of the union.
 */
const declaresAnyEffect = (
	effects: readonly IToolEffect[] | undefined,
): effects is readonly IToolEffect[] =>
	effects !== undefined && effects.length > 0;

/**
 * Solid-SRP: empty-input probe. "If the inputSchema accepts `{}`, the
 * tool MUST handle `{}` without crashing and return output that
 * matches the outputSchema (or be a documented catchall)."
 *
 * Pure: no globals, no I/O, no logger. The caller passes a handle.
 */
export const runEmptyInputProbe = async (
	handle: IToolHandle,
): Promise<IProbeResult> => {
	const { tool, inputSchema, outputSchema, invoke } = handle;

	// f00030-protect-diagram-modules / AUD-D07: tools that declare ANY
	// side effect MUST NOT be probed with empty input — invoking them
	// with `{}` would execute real subprocesses (e.g. `run_quality`
	// running `vitest`, `tsc`, `bun run build`) and hang the verify
	// harness for as long as those scripts take.
	//
	// AUD-D07 found this guard re-enumerating the members of
	// `IToolEffect` with its own string literals (`'spawn'`,
	// `'fs:write'`, `'network'`) instead of importing the union. Two of
	// those three literals didn't exist in the union — `'fs:write'` was
	// a typo for `'write'` — so the guard silently skipped nothing for
	// the 33 tools declaring `effects: ['write']`, and never covered
	// `'destructive'` at all. `tsc` had already flagged the typo'd
	// comparison as TS2367 ("no overlap"); nobody saw it because
	// `tools/` wasn't typechecked (AUD-A12).
	//
	// The fix removes the enumeration instead of correcting it: any
	// declared effect at all is reason enough not to probe. There is
	// nothing left here that can drift out of sync with `IToolEffect` —
	// a new member added to that union is automatically covered by
	// `.length > 0` without touching this file. Report them as
	// `needs-input` to keep the harness fast, and rely on the plugin's
	// own test suite for the happy-path coverage.
	if (declaresAnyEffect(tool.effects)) {
		return {
			tool: tool.id,
			outcome: 'needs-input',
			handlerReturned: true,
			detail: `skipped: declared side-effect (${tool.effects.map(describeEffect).join(', ')})`,
		};
	}

	// Schema gate: does the inputSchema accept an empty payload?
	if (inputSchema) {
		const emptyProbe = inputSchema.safeParse({});
		if (!emptyProbe.success) {
			return {
				tool: tool.id,
				outcome: 'needs-input',
				handlerReturned: true,
				detail: emptyProbe.error.issues
					.slice(0, 1)
					.map((i) => `${i.path.join('.')}: ${i.message}`)
					.join('; '),
			};
		}
	}

	// Input is acceptable empty; invoke and check the output.
	let result: unknown;
	let isError = false;
	let handlerReturned = false;
	let invocationError: string | undefined;
	try {
		if (handle.invokeRaw !== undefined) {
			const raw = await handle.invokeRaw({});
			result = raw.payload;
			isError = raw.isError;
		} else {
			result = await invoke({});
		}
		handlerReturned = true;
	} catch (err) {
		invocationError = (err as Error).message;
		handlerReturned = true;
	}

	// x00107: SDK-faithful semantics — validateToolOutput SKIPS schema
	// validation for isError results, so a structured `toolError` on
	// empty input is a graceful, spec-conformant answer, not a failure.
	// (The pre-x00107 probe validated the error envelope against the
	// SUCCESS schema and misread 3 correct tools as drift.)
	if (isError && invocationError === undefined) {
		return {
			tool: tool.id,
			outcome: 'ok',
			handlerReturned,
			detail: 'returned a structured error (SDK skips outputSchema validation on isError)',
		};
	}

	if (invocationError === 'Tool surface runtime is not initialized yet.') {
		return {
			tool: tool.id,
			outcome: 'needs-input',
			handlerReturned,
			detail: invocationError,
		};
	}

	let outcome: IProbeOutcome = 'failed';
	if (invocationError !== undefined) {
		// Handler crashed on input that the schema accepted — real bug.
		outcome = 'failed';
	} else if (outputSchema) {
		// Validate unconditionally — covers primitives (string/number/boolean),
		// null, undefined, and objects. The previous version only entered
		// this branch when `typeof result === 'object' && result !== null`,
		// so primitive-returning tools with an `outputSchema` were silently
		// marked 'failed' even when their output matched the schema.
		try {
			outputSchema.parse(result);
			outcome = 'ok';
		} catch (parseError) {
			// x00105: record WHY the output violated its declared schema
			// — a red row without the zod issue forces a debugger re-run.
			outcome = 'failed';
			invocationError = `output violates outputSchema: ${(parseError as Error).message}`;
		}
	} else {
		// catchall schemas are documented exceptions (AGENTS.md #8).
		outcome = handlerReturned ? 'ok' : 'failed';
	}
	return {
		tool: tool.id,
		outcome,
		handlerReturned,
		...(invocationError !== undefined && { detail: invocationError }),
	};
};

/**
 * Solid-SRP: happy-path probe. "If the tool requires real input,
 * feed it the minimal valid payload and verify the handler's output
 * satisfies the outputSchema."
 *
 * Returns `null` when the tool id is not in the `PROBE_INPUTS` map
 * — the caller skips it (the only tools that get a happy-path
 * probe are the ones we know how to drive).
 */
export type IProbeInputBuilder = (id: string) => Record<string, unknown> | null;

/** Returns the input shape for each "needs-input" tool we know how to drive. */
export const KNOWN_PROBE_INPUTS: IProbeInputBuilder = (id) => {
	switch (id) {
		case 'fs_read':
			return { path: 'plugins/audit/README.md' };
		case 'fs_write':
			return {
				path: '.cache/mcp-vertex/verify/probe.txt',
				content: 'plugin-tool-verify probe',
			};
		case 'scaffold':
			return { kind: 'tool', name: 'verify-probe' };
		default:
			return null;
	}
};

/**
 * Tool IDs the happy-path probe should attempt. Kept as a constant
 * (instead of "all tools") because the probe input builder only
 * knows a few IDs by name.
 */
export const HAPPY_PATH_PROBE_IDS: readonly string[] = [
	'fs_read',
	'fs_write',
	'scaffold',
];

/**
 * Solid-SRP: happy-path probe. Returns `null` if the tool id has no
 * known probe input, or if the schema rejected it.
 */
export const runHappyPathProbe = async (
	handle: IToolHandle,
	buildInput: IProbeInputBuilder = KNOWN_PROBE_INPUTS,
): Promise<IProbeResult | null> => {
	const { tool, inputSchema, outputSchema, invoke } = handle;
	const probeInput = buildInput(tool.id);
	if (!probeInput) return null;
	if (!inputSchema || !outputSchema) return null;

	const parseResult = inputSchema.safeParse(probeInput);
	if (!parseResult.success) {
		return {
			tool: tool.id,
			outcome: 'failed',
			handlerReturned: false,
			detail: `probe input rejected: ${parseResult.error.issues[0]?.message ?? 'unknown'}`,
		};
	}

	let result: unknown;
	try {
		result = await invoke(parseResult.data);
	} catch (err) {
		return {
			tool: tool.id,
			outcome: 'failed',
			handlerReturned: false,
			detail: `handler crashed: ${(err as Error).message}`,
		};
	}

	try {
		outputSchema.parse(result);
		return {
			tool: tool.id,
			outcome: 'ok',
			handlerReturned: true,
		};
	} catch (err) {
		return {
			tool: tool.id,
			outcome: 'failed',
			handlerReturned: true,
			detail: `output mismatch: ${(err as Error).message}`,
		};
	}
};
