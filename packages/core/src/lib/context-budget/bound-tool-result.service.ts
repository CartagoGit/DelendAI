/**
 * bound-tool-result.service.ts — no tool result leaves over its byte budget.
 *
 * Bounding was opt-in through `toolJsonBounded`, so a tool nobody thought of
 * as unbounded could answer with anything: `review_queue` alone sent 180 MB
 * in a week. The seam every result passes through now holds the line.
 *
 * An oversized result becomes a failure on purpose. A tool's output schema
 * describes its full answer, so a cut-down one cannot conform to it; a stated
 * failure carrying the head and the path of the kept output can.
 */
import { DEFAULT_MAX_RESPONSE_BYTES } from '../contracts/constants/response-byte-budget.constant';
import { toolError, truncateIfTooLarge } from '../shared/tool-response';
import {
	elideKeepingOutput,
	settleToolOutputArtifacts,
} from './elide-tool-result.service';

interface IToolResultShape {
	readonly content?: readonly { readonly text?: unknown }[];
	readonly structuredContent?: unknown;
	readonly isError?: unknown;
	readonly _meta?: unknown;
}

/** What the result answers with: its structured content, or its text. */
const payloadOf = (result: IToolResultShape): unknown =>
	result.structuredContent ??
	result.content
		?.map((part) => part.text)
		.filter((text) => typeof text === 'string')
		.join('\n');

/**
 * `result` when it fits the budget, otherwise a failure with its head and the
 * path of the full output. A failure stays as it is: it is the explanation.
 */
export const boundToolResult = async (
	result: unknown,
	config: { readonly maxToolResultBytes?: number | undefined } = {},
): Promise<unknown> => {
	const maxBytes = config.maxToolResultBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
	if (typeof result !== 'object' || result === null) return result;
	const shaped = result as IToolResultShape;
	if (shaped.isError === true) return result;
	const payload = payloadOf(shaped);
	if (payload === undefined) return result;
	const elided = elideKeepingOutput(payload, maxBytes, truncateIfTooLarge);
	if (elided === payload) return result;
	const { originalBytes, artifact } = elided as {
		readonly originalBytes: number;
		readonly artifact?: string;
	};
	const failure = toolError(
		`The result is ${String(originalBytes)} bytes, over the ${String(maxBytes)} byte budget.`,
		artifact === undefined
			? 'Narrow the call with its filter, limit or offset arguments.'
			: 'Read the rest from `artifact`, or narrow the call with its filter, limit or offset arguments.',
		'response-too-large',
	);
	const envelope = {
		...failure.structuredContent,
		...(elided as Record<string, unknown>),
	};
	return settleToolOutputArtifacts({
		...failure,
		content: [{ type: 'text', text: JSON.stringify(envelope) }],
		structuredContent: envelope,
		...(shaped._meta === undefined ? {} : { _meta: shaped._meta }),
	});
};
