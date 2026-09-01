import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import type { IToolAccessState } from '../contracts/interfaces/tool-surface.interface';
import { TOOL_DETAILS_PREFIX } from '../contracts/constants/tool-details-prefix.constant';
import type { IDryRunContractRefusal } from '../dry-run/enforce';
import { toolError, type IToolTextResult } from '../shared/tool-response';

const MAX_PUBLIC_DESCRIPTION_CHARS = 120;

export { TOOL_DETAILS_PREFIX };

/** Visibility: is this tool listed in tools/list right now? */
export const isToolVisible = (state: IToolAccessState): boolean =>
	state === 'visible';

/** Authorization: is this tool allowed to execute at all? */
export const isToolAuthorized = (state: IToolAccessState): boolean =>
	state !== 'deactivated';

/**
 * Apply a visibility intent (from a surface-mode change or an explicit
 * `plugin_activate`) without touching authorization. A deactivated tool
 * stays deactivated — visibility intent alone can never re-authorize it,
 * which is exactly the invariant that makes "deactivated but visible"
 * unrepresentable.
 */
export const withVisibilityIntent = (
	current: IToolAccessState,
	wantsVisible: boolean,
): IToolAccessState => {
	if (current === 'deactivated') return 'deactivated';
	return wantsVisible ? 'visible' : 'hidden';
};

/**
 * Thrown by `invokeTool` when the resolved tool has been deactivated
 * (`plugin_deactivate`). Distinct from "unknown tool" so callers can
 * distinguish routing failures from authorization refusals.
 */
export class ToolNotAuthorizedError extends Error {
	readonly toolName: string;

	constructor(toolName: string) {
		super(
			`Tool "${toolName}" is deactivated and cannot be invoked. Call plugin_activate to re-authorize it.`,
		);
		this.name = 'ToolNotAuthorizedError';
		this.toolName = toolName;
	}
}

export const compactDescription = (
	description: string | undefined,
	summary: string | undefined,
): string | undefined => {
	if (summary !== undefined && summary.trim().length > 0) return summary;
	if (description === undefined) return undefined;
	const oneLine = description.replace(/\s+/g, ' ').trim();
	if (oneLine.length <= MAX_PUBLIC_DESCRIPTION_CHARS) return oneLine;
	return `${oneLine.slice(0, MAX_PUBLIC_DESCRIPTION_CHARS - 3)}...`;
};

export const safeParseSurfaceArgs = async (
	schema: unknown,
	args: unknown,
): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> => {
	if (schema === undefined) return { ok: true, value: args };
	const parser = schema as {
		safeParseAsync?: (
			value: unknown,
		) => Promise<
			| { success: true; data: unknown }
			| { success: false; error: { message?: string } }
		>;
	};
	if (typeof parser.safeParseAsync !== 'function') {
		return { ok: true, value: args };
	}
	const parsed = await parser.safeParseAsync(args);
	if (parsed.success) return { ok: true, value: parsed.data };
	return {
		ok: false,
		message: parsed.error.message ?? 'Invalid routed arguments.',
	};
};

/**
 * Extract `args.dryRun` from the caller-supplied, PRE-schema-parse args.
 * We deliberately read the raw args rather than the zod-parsed value:
 * a handler's `inputSchema` may not declare `dryRun` explicitly (or may
 * strip unrecognised keys on parse), and the caller's actual intent
 * must not be lost to how a plugin happened to shape its schema.
 */
export const readDryRunFlag = (args: unknown): unknown => {
	if (typeof args !== 'object' || args === null) return undefined;
	if (!('dryRun' in args)) return undefined;
	return (args as { dryRun: unknown }).dryRun;
};

/**
 * Turn a dry-run contract refusal (`enforceDryRunReturnContract`) into
 * the same MCP tool-result envelope every other runtime-level failure
 * uses (`toolError`): a proper `isError: true` result the router/host
 * surfaces to the caller, never an uncaught throw. Preserves the
 * refusal's structural issues so an agent debugging a broken plugin
 * can see exactly which field was wrong.
 */
export const buildDryRunContractViolationResult = (
	toolName: string,
	refusal: IDryRunContractRefusal,
): IToolTextResult => {
	const issuesSummary = refusal.issues
		.map((issue) => `${issue.path}: ${issue.message}`)
		.join('; ');
	const reason =
		issuesSummary.length === 0
			? `Tool "${toolName}" violated the dryRun contract: ${refusal.reason}`
			: `Tool "${toolName}" violated the dryRun contract: ${refusal.reason} (${issuesSummary})`;
	return toolError(
		reason,
		'The handler must return { dryRun: true, wouldChange, wouldRun, risk } when args.dryRun is true, and must not perform the real effect.',
	);
};

export const buildToolKnowledgeEntry = (input: {
	readonly id: string;
	readonly name: string;
	readonly summary?: string | undefined;
	readonly pluginId?: string | undefined;
	readonly namespace?: string | undefined;
	readonly description?: string | undefined;
}): IKnowledgeEntry => ({
	id: input.id,
	title: `Tool ${input.name}`,
	body: [
		`# ${input.name}`,
		'',
		input.summary !== undefined ? `Summary: ${input.summary}` : undefined,
		input.pluginId !== undefined
			? `Plugin: ${input.pluginId} (${input.namespace ?? input.pluginId})`
			: 'Plugin: core',
		input.description !== undefined ? '' : undefined,
		input.description,
	]
		.filter((line): line is string => typeof line === 'string')
		.join('\n'),
});
