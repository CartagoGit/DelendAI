/**
 * normalize-response.service.ts — a large external answer becomes the
 * few facts an agent needs, with the raw answer kept behind a handle.
 *
 * A design file or a page's markup runs to hundreds of kilobytes, and an
 * agent needs its names, sizes and a few values. Returning it whole spent
 * the context on everything else; the raw answer is written once to the
 * plugin's cache and opened by its handle only when the facts fall short.
 */
import { createHash } from 'node:crypto';

import type { INormalizedAnswer } from '../contracts/interfaces/external-answer.interface';

const MAX_FACTS = 80;
const MAX_TEXT = 400;
const MAX_DEPTH = 4;

const collect = (
	value: unknown,
	path: string,
	depth: number,
	into: Record<string, string | number | boolean>,
): void => {
	if (Object.keys(into).length >= MAX_FACTS) return;
	if (typeof value === 'string') {
		into[path] =
			value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
		return;
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		into[path] = value;
		return;
	}
	if (Array.isArray(value)) {
		into[`${path}.length`] = value.length;
		if (depth < MAX_DEPTH && value.length > 0)
			collect(value[0], `${path}[0]`, depth + 1, into);
		return;
	}
	if (typeof value === 'object' && value !== null && depth < MAX_DEPTH)
		for (const [key, child] of Object.entries(value))
			collect(
				child,
				path.length === 0 ? key : `${path}.${key}`,
				depth + 1,
				into,
			);
};

/**
 * The facts of an MCP `tools/call` result: its structured content when
 * it has one, else its text content. `keep` stores the raw answer and
 * is called once per distinct answer.
 */
export const normalizeResponse = async (
	raw: unknown,
	keep: (handle: string, json: string) => Promise<void>,
): Promise<INormalizedAnswer> => {
	const json = JSON.stringify(raw ?? null);
	const handle = `ext-raw:${createHash('sha256').update(json).digest('hex').slice(0, 16)}`;
	await keep(handle, json);
	const result = (
		typeof raw === 'object' && raw !== null ? raw : {}
	) as Record<string, unknown>;
	const facts: Record<string, string | number | boolean> = {};
	if (
		typeof result.structuredContent === 'object' &&
		result.structuredContent !== null
	)
		collect(result.structuredContent, '', 0, facts);
	else if (Array.isArray(result.content))
		result.content.forEach((part, index) => {
			const text = (part as { text?: unknown }).text;
			if (typeof text === 'string') {
				let parsed: unknown;
				try {
					parsed = JSON.parse(text);
				} catch {
					parsed = text;
				}
				collect(parsed, `content[${String(index)}]`, 0, facts);
			}
		});
	return {
		facts,
		handle,
		rawBytes: Buffer.byteLength(json),
		factBytes: Buffer.byteLength(JSON.stringify(facts)),
	};
};
