/**
 * Pure error-shaping helpers for the auto-reporting plugin. Everything
 * here is side-effect free so the decision/body logic is unit-testable
 * without touching a real error, the filesystem or the network.
 */

/**
 * Markers that indicate a failure originated inside mcp-vertex itself
 * rather than in the host project. A stack trace from mcp-vertex code
 * will contain at least one of these (source paths, package scope, or
 * the plugin/loader vocabulary). Kept deliberately conservative: better
 * to miss an exotic origin than to upload a host project's own stack.
 */
const INTERNAL_MARKERS: readonly string[] = [
	'mcp-vertex',
	'@mcp-vertex',
	'/packages/core/',
	'/plugins/',
];

export const messageOf = (error: unknown): string | undefined => {
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (typeof error === 'object' && error !== null) {
		const record = error as { message?: unknown };
		if (typeof record.message === 'string') return record.message;
	}
	return undefined;
};

export const stackOf = (error: unknown): string | undefined => {
	if (error instanceof Error) return error.stack;
	if (typeof error === 'object' && error !== null) {
		const record = error as { stack?: unknown };
		if (typeof record.stack === 'string') return record.stack;
	}
	return undefined;
};

/** True when the failure appears to originate inside mcp-vertex. */
export const isMcpVertexInternal = (error: unknown): boolean => {
	const haystack =
		`${messageOf(error) ?? ''}\n${stackOf(error) ?? ''}`.toLowerCase();
	return INTERNAL_MARKERS.some((marker) => haystack.includes(marker));
};

const HEX = /\b0x[0-9a-f]+\b/g;
const NUMBERS = /\d+/g;
const PATH = /\/[^\s"'`]*/g;

const MAX_SIGNATURE_LENGTH = 280;
const MAX_TITLE_LENGTH = 180;

/**
 * Collapse the variable parts of an error message so two sightings of
 * the same bug (different timestamps, port numbers, absolute paths,
 * addresses) produce the same stable signature. Never used for display.
 */
export const normalizeMessage = (message: string): string =>
	message
		.replace(HEX, '<hex>')
		.replace(NUMBERS, '<n>')
		.replace(PATH, '<path>')
		.replace(/\s+/g, ' ')
		.trim();

/** Stable de-duplication key for `toolName` + error. */
export const signatureOf = (toolName: string, error: unknown): string => {
	const normalized = normalizeMessage(messageOf(error) ?? 'unknown error');
	return `${toolName}::${normalized}`.slice(0, MAX_SIGNATURE_LENGTH);
};

const truncate = (value: string, max: number): string =>
	value.length > max ? `${value.slice(0, max - 1)}…` : value;

/** Issue title; the `[auto]` prefix makes machine reports obvious in a list. */
export const buildIssueTitle = (toolName: string, error: unknown): string => {
	const message = messageOf(error) ?? 'unknown error';
	return truncate(
		`[auto] ${toolName}: ${message.replace(/\s+/g, ' ').trim()}`,
		MAX_TITLE_LENGTH,
	);
};

export interface IBuildIssueBodyInput {
	readonly toolName: string;
	readonly error: unknown;
	readonly signature: string;
	readonly argsJson: string;
	readonly elapsedMs?: number | undefined;
	readonly ts: string;
	readonly namespacePrefix: string;
	readonly host?: string | undefined;
	readonly model?: string | undefined;
}

/** Full markdown body: detail + redacted log + opt-out instructions. */
export const buildIssueBody = (input: IBuildIssueBodyInput): string => {
	const stack = stackOf(input.error);
	const lines: string[] = [
		'## Automatic error report',
		'',
		'This issue was opened automatically by `@mcp-vertex/error-reporting` ' +
			'after an mcp-vertex internal failure was detected in a host project.',
		'',
		'| Field | Value |',
		'| --- | --- |',
		`| Tool | \`${input.toolName}\` |`,
		`| Namespace | \`${input.namespacePrefix}\` |`,
		`| Detected at | ${input.ts} |`,
		`| De-duplication signature | \`${input.signature}\` |`,
	];
	if (input.elapsedMs !== undefined) {
		lines.push(`| Elapsed | ${Math.round(input.elapsedMs)} ms |`);
	}
	if (input.host !== undefined) {
		lines.push(`| Host | ${input.host} |`);
	}
	if (input.model !== undefined) {
		lines.push(`| Model | ${input.model} |`);
	}
	lines.push(
		'',
		'## Error',
		'',
		'```',
		messageOf(input.error) ?? 'unknown error',
		'```',
	);
	if (stack !== undefined && stack.trim() !== '') {
		lines.push('', '## Stack trace', '', '```', stack.trim(), '```');
	}
	if (input.argsJson.trim() !== '' && input.argsJson.trim() !== '{}') {
		lines.push(
			'',
			'## Tool arguments (redacted)',
			'',
			'```json',
			input.argsJson,
			'```',
		);
	}
	lines.push(
		'',
		'## How to disable',
		'',
		'```jsonc',
		'{ "plugins": { "error-reporting": { "options": { "enabled": false } } } }',
		'```',
	);
	return `${lines.join('\n').trim()}\n`;
};
