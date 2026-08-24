import type { IKnowledgeEntry } from '../contracts/interfaces/knowledge.interface';
import { TOOL_DETAILS_PREFIX } from '../contracts/constants/tool-details-prefix.constant';

const MAX_PUBLIC_DESCRIPTION_CHARS = 120;

export { TOOL_DETAILS_PREFIX };

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
