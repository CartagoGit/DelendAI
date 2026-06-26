import { z } from 'zod';

import {
	toolError,
	toolJson,
	type IToolRegistration,
	type IToolTextResult,
} from '@mcp-vertex/core/public';

import {
	CLOSE_MARKER_STATES,
	formatCloseMarker,
	type CloseMarker,
	type CloseMarkerLocale,
} from '../markers';
import {
	validateCloseMarker,
	validateResponseClose,
	type IValidationResult,
} from '../validate';

// --- output schemas (N16) --------------------------------------------------

const CloseOkSchema = z.object({
	ok: z.literal(true),
	state: z.enum(
		CLOSE_MARKER_STATES as readonly [CloseMarker, ...CloseMarker[]],
	),
	reason: z.string().optional(),
	/**
	 * Locale the rendered `line` was emitted with. Default is `'es'`
	 * (legacy canonical state name); `'en'` renders shorter English
	 * tokens. See proposal `f00070` for rationale.
	 */
	locale: z.enum(['es', 'en']).optional(),
	line: z.string(),
});

const ValidateOkSchema = z.object({
	ok: z.literal(true),
	state: z.enum(
		CLOSE_MARKER_STATES as readonly [CloseMarker, ...CloseMarker[]],
	),
	reason: z.string().optional(),
	line: z.string(),
});

const ValidateFailSchema = z.object({
	ok: z.literal(false),
	state: z
		.enum(CLOSE_MARKER_STATES as readonly [CloseMarker, ...CloseMarker[]])
		.optional(),
	reason: z.string().optional(),
	line: z.string().optional(),
	violation: z.string().optional(),
	violations: z.array(z.string()).optional(),
});

// --- input schemas ---------------------------------------------------------

const CloseInputSchema = z.object({
	state: z.enum(
		CLOSE_MARKER_STATES as readonly [CloseMarker, ...CloseMarker[]],
	),
	reason: z.string().max(160, 'reason too long (max 160 chars)').optional(),
	/**
	 * Locale for the rendered bracket text. `'es'` (default) keeps the
	 * canonical state name verbatim; `'en'` renders the shorter English
	 * token (e.g. `[DONE]` instead of `[HECHO]`). See proposal `f00070`.
	 */
	locale: z.enum(['es', 'en']).optional(),
});

const ValidateInputSchema = z.object({
	/** Full response text whose last line must be the canonical marker. */
	text: z.string(),
});

// --- builders --------------------------------------------------------------

export interface ICloseToolOptions {
	readonly namespacePrefix: string;
}

/**
 * `<prefix>_close` — return the exact canonical line an agent must paste
 * as the **last** visible line of its response. Pure: no I/O.
 */
export const buildCloseRegistration = (
	options: ICloseToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'close',
		summary:
			'Return the canonical close-marker line for the given state (+ optional reason).',
		tags: ['agent-contract'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_close`,
				{
					description:
						'Returns the exact line an agent must paste at the end of its response to honour the coloured close-marker convention. The reason is mandatory for CAP, RE-PIVOT, CHECKPOINT-REQUIRED, REPAIR-NEEDED and BLOQUEADO; otherwise it is optional.',
					inputSchema: CloseInputSchema,
					outputSchema: CloseOkSchema,
				},
				async (args: {
					state: CloseMarker;
					reason?: string | undefined;
					locale?: CloseMarkerLocale | undefined;
				}): Promise<IToolTextResult> => {
					const locale: CloseMarkerLocale = args.locale ?? 'es';
					const line = formatCloseMarker(args.state, args.reason, {
						locale,
					});
					const audit = validateCloseMarker(line);
					if (!audit.ok) {
						return toolError(
							'formatCloseMarker produced an invalid line',
							`state=${args.state} line=${JSON.stringify(line)} violation=${audit.violation ?? audit.violations?.join(',')}`,
						);
					}
					return toolJson({
						ok: true as const,
						state: args.state,
						...(args.reason !== undefined
							? { reason: args.reason }
							: {}),
						locale,
						line,
					});
				},
			);
		},
	};
};

/**
 * `<prefix>_validate` — audit a block of text; report whether the last
 * line is a valid canonical close marker.
 */
export const buildValidateRegistration = (
	options: ICloseToolOptions,
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'validate',
		summary:
			'Audit a response: does its last line match the canonical close marker?',
		tags: ['agent-contract'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_validate`,
				{
					description:
						'Inspect a full response and report whether the last visible line is a valid coloured close marker (8 states, ≤120 chars, reason required for 5 states, no extra prose after the marker).',
					inputSchema: ValidateInputSchema,
					outputSchema: z.union([
						ValidateOkSchema,
						ValidateFailSchema,
					]),
				},
				async (args: { text: string }): Promise<IToolTextResult> => {
					const result: IValidationResult = validateResponseClose(
						args.text,
					);
					return toolJson(result);
				},
			);
		},
	};
};

/**
 * `<prefix>_ping` — health check echoing resolved paths. Inherits the
 * scaffold pattern used by other plugins so the plugin is greppable in
 * the tool list.
 */
export const buildPingRegistration = (
	options: ICloseToolOptions & {
		readonly cacheDir: string;
		readonly docsDir: string;
	},
): IToolRegistration => {
	const prefix = options.namespacePrefix;
	return {
		id: 'ping',
		summary: 'Health check for the status-marker plugin.',
		tags: ['health'],
		register: async (server) => {
			server.registerTool(
				`${prefix}_ping`,
				{
					description:
						'Echo plugin identity and resolved paths. Useful for confirming the plugin is loaded.',
					inputSchema: z.object({}),
					outputSchema: z.object({
						plugin: z.literal('status-marker'),
						cacheDir: z.string(),
						docsDir: z.string(),
					}),
				},
				async () =>
					toolJson({
						plugin: 'status-marker' as const,
						cacheDir: options.cacheDir,
						docsDir: options.docsDir,
					}),
			);
		},
	};
};

/** Convenience: build the full tool set in declaration order. */
export const buildCloseTools = (
	options: ICloseToolOptions & {
		readonly cacheDir: string;
		readonly docsDir: string;
	},
): readonly IToolRegistration[] => [
	buildCloseRegistration(options),
	buildValidateRegistration(options),
	buildPingRegistration(options),
];
