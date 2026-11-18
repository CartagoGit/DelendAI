import type {
	IToolFailure,
	ToolFailureClass,
} from '../contracts/interfaces/runtime-event.interface';
import type { IToolFailureInput } from '../contracts/interfaces/tool-failure-input.interface';
import { redactSecrets } from '../shared/redact';

const MAX_CODE_LENGTH = 120;
const FALLBACK_CODE = 'unknown';

/** Markers the MCP SDK and the tool schemas use for a rejected argument set. */
const INPUT_INVALID_RE =
	/input validation error|invalid arguments for tool|invalid_type|invalid params|\bzoderror\b/iu;

const textOf = (value: unknown): string => {
	if (typeof value === 'string') return value;
	if (value instanceof Error) return value.message;
	return '';
};

const resultReason = (result: unknown): string => {
	const structured = (
		result as { structuredContent?: { error?: unknown } } | null
	)?.structuredContent?.error as
		| { reason?: unknown; message?: unknown }
		| undefined;
	const fromEnvelope =
		textOf(structured?.reason) || textOf(structured?.message);
	if (fromEnvelope !== '') return fromEnvelope;
	const content = (result as { content?: unknown } | null)?.content;
	if (!Array.isArray(content)) return '';
	for (const part of content) {
		const text = textOf((part as { text?: unknown } | null)?.text);
		if (text !== '') return text;
	}
	return '';
};

const structuredCode = (result: unknown): string | undefined => {
	const code = (
		result as { structuredContent?: { error?: { code?: unknown } } } | null
	)?.structuredContent?.error?.code;
	return typeof code === 'string' && code !== '' ? code : undefined;
};

/** Ids, hashes, numbers, paths and quoted values become placeholders. */
const generalise = (reason: string): string => {
	const firstSentence = reason.trim().split(/(?<=[.!?])\s|\n/u)[0] ?? '';
	return firstSentence
		.replace(/(["'`])(?:(?!\1).)*\1/gu, '<value>')
		.replace(/(?:[A-Za-z]:)?(?:\.{0,2}\/|\\)[^\s,;:]+/gu, '<path>')
		.replace(/\b[0-9a-f]{7,}\b/giu, '<hash>')
		.replace(/\b[a-z]{1,3}\d{3,}(?:-[A-Za-z0-9]+)*\b/giu, '<id>')
		.replace(/\bS\d+\b/gu, '<id>')
		.replace(/\d+(?:\.\d+)?/gu, '<n>')
		.replace(/\s+/gu, ' ')
		.trim();
};

const boundedCode = (raw: string): string => {
	const redacted = redactSecrets(raw).text.trim();
	return (redacted === '' ? FALLBACK_CODE : redacted).slice(
		0,
		MAX_CODE_LENGTH,
	);
};

const classify = (
	input: IToolFailureInput,
	reason: string,
): ToolFailureClass => {
	if (input.cancelled === true) return 'cancelled';
	if (INPUT_INVALID_RE.test(reason)) return 'input-invalid';
	return input.error !== undefined ? 'threw' : 'refused';
};

/** The class and stable code of one failed tool call. Pure; never throws. */
export const deriveToolFailure = (input: IToolFailureInput): IToolFailure => {
	const reason =
		input.error !== undefined && input.cancelled !== true
			? textOf(input.error) || String(input.error)
			: resultReason(input.result);
	const failureClass = classify(input, reason);
	const explicit =
		failureClass === 'cancelled' ? undefined : structuredCode(input.result);
	return {
		class: failureClass,
		code: boundedCode(explicit ?? generalise(reason)),
	};
};

/** The `failure` field of a runtime event: set on failed calls only. */
export const failureField = (
	isError: boolean,
	result: unknown,
	error: unknown,
	cancelled: boolean,
): { readonly failure?: IToolFailure } =>
	isError ? { failure: deriveToolFailure({ result, error, cancelled }) } : {};
