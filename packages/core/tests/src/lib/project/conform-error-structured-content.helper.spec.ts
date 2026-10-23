/**
 * conform-error-structured-content.helper.spec.ts — an error result keeps
 * its `structuredContent` only when the tool's output schema accepts it
 * without stripping a key; everything else reaches the wire unchanged.
 */

import { describe, expect, it } from 'vitest';
import z from 'zod';

import {
	conformErrorStructuredContent,
	resolveOutputParser,
} from '@delendai/core/lib/project/conform-error-structured-content.helper';
import { toolError, toolOk } from '@delendai/core/lib/shared/tool-response';

const SUCCESS_SCHEMA = z.object({ ok: z.literal(true), value: z.string() });
const ERROR_SCHEMA = z.object({
	ok: z.literal(false),
	error: z.object({
		reason: z.string(),
		nextAction: z.string().optional(),
	}),
});

describe('resolveOutputParser', () => {
	it('uses a schema as is', () => {
		expect(resolveOutputParser(SUCCESS_SCHEMA)).toBe(SUCCESS_SCHEMA);
	});

	it('wraps a raw shape of schemas in an object schema', () => {
		const parser = resolveOutputParser({ value: z.string() });
		expect(parser?.safeParse({ value: 'x' }).success).toBe(true);
		expect(parser?.safeParse({ value: 1 }).success).toBe(false);
	});

	it('treats anything else as no schema', () => {
		expect(resolveOutputParser(undefined)).toBeUndefined();
		expect(resolveOutputParser('schema')).toBeUndefined();
		expect(resolveOutputParser({})).toBeUndefined();
		expect(resolveOutputParser({ value: 'not a schema' })).toBeUndefined();
	});
});

describe('conformErrorStructuredContent', () => {
	it('leaves results untouched when there is no schema or no object', () => {
		const error = toolError('bad input');
		expect(conformErrorStructuredContent(error, undefined)).toBe(error);
		expect(conformErrorStructuredContent('text', SUCCESS_SCHEMA)).toBe(
			'text',
		);
		expect(conformErrorStructuredContent(null, SUCCESS_SCHEMA)).toBeNull();
	});

	it('never touches a success result or an error without structured content', () => {
		const success = toolOk({ value: 'pong' });
		const textOnly = {
			content: [{ type: 'text', text: 'failed' }],
			isError: true,
		};
		expect(conformErrorStructuredContent(success, SUCCESS_SCHEMA)).toBe(
			success,
		);
		expect(conformErrorStructuredContent(textOnly, SUCCESS_SCHEMA)).toBe(
			textOnly,
		);
	});

	it('keeps structured content on an error its schema models', () => {
		const error = toolError('bad input', 'pass a value');
		expect(conformErrorStructuredContent(error, ERROR_SCHEMA)).toBe(error);
	});

	it('keeps a conforming error whose keys come in a different order', () => {
		const error = {
			content: [{ type: 'text', text: '{}' }],
			structuredContent: { error: { reason: 'r' }, ok: false },
			isError: true,
		};
		expect(conformErrorStructuredContent(error, ERROR_SCHEMA)).toBe(error);
	});

	it('drops structured content the schema rejects, keeping text, flag and meta', () => {
		const error = {
			...toolError('bad input', 'pass a value'),
			_meta: { logHint: { path: '/log', line: 0, ts: 't' } },
		};

		const onWire = conformErrorStructuredContent(error, SUCCESS_SCHEMA);

		expect(onWire).not.toHaveProperty('structuredContent');
		expect(onWire).toEqual({
			content: error.content,
			isError: true,
			_meta: error._meta,
		});
		expect(error.structuredContent).toEqual({
			ok: false,
			error: { reason: 'bad input', nextAction: 'pass a value' },
		});
	});

	it('drops structured content the schema would only accept by stripping keys', () => {
		const error = {
			content: [{ type: 'text', text: '{}' }],
			structuredContent: {
				ok: false,
				error: { reason: 'r', code: 'extra' },
			},
			isError: true,
		};
		expect(
			conformErrorStructuredContent(error, ERROR_SCHEMA),
		).not.toHaveProperty('structuredContent');
	});
});
