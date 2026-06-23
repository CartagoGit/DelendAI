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

import type { IToolRegistration } from '@mcp-vertex/core/public';

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
}

/** Outcome of a probe — same shape the script used to build inline. */
export type ProbeOutcome =
	/** Empty-input probe: schema accepts `{}` AND handler returned a schema-matching result. */
	| 'ok'
	/** Empty-input probe: inputSchema rejected `{}` — tool documents required input. */
	| 'needs-input'
	/** Any probe: handler crashed on schema-accepted input, or output did not match. */
	| 'failed';

/** Result of a single probe over one tool. Stable shape for the table renderer. */
export interface IProbeResult {
	readonly tool: string;
	readonly outcome: ProbeOutcome;
	readonly handlerReturned: boolean;
	readonly detail?: string;
}

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
	let handlerReturned = false;
	let invocationError: string | undefined;
	try {
		result = await invoke({});
		handlerReturned = true;
	} catch (err) {
		invocationError = (err as Error).message;
		handlerReturned = true;
	}

	let outcome: ProbeOutcome = 'failed';
	if (invocationError !== undefined) {
		// Handler crashed on input that the schema accepted — real bug.
		outcome = 'failed';
	} else if (outputSchema && typeof result === 'object' && result !== null) {
		try {
			outputSchema.parse(result);
			outcome = 'ok';
		} catch {
			outcome = 'failed';
		}
	} else if (!outputSchema) {
		// catchall schemas are documented exceptions (AGENTS.md #8).
		outcome = handlerReturned ? 'ok' : 'failed';
	}
	return {
		tool: tool.id,
		outcome,
		handlerReturned,
		detail: invocationError,
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
export type ProbeInputBuilder = (id: string) => Record<string, unknown> | null;

/** Returns the input shape for each "needs-input" tool we know how to drive. */
export const KNOWN_PROBE_INPUTS: ProbeInputBuilder = (id) => {
	switch (id) {
		case 'fs_read':
			return { path: 'plugins/audit/README.md' };
		case 'fs_write':
			return {
				path: '.verify-tmp/probe.txt',
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
	buildInput: ProbeInputBuilder = KNOWN_PROBE_INPUTS,
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
