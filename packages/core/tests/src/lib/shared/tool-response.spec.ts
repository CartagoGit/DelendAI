import { describe, expect, it } from 'vitest';

import {
	toolErrorWithLogHint,
	toolJson,
	toolOk,
	toolError,
} from '@mcp-vertex/core/public';

describe('tool-response helpers — MCP modern structuredContent', () => {
	it('toolJson mirrors an object payload into structuredContent', () => {
		const res = toolJson({ a: 1, b: 'x' });
		expect(res.content[0]?.text).toBe(JSON.stringify({ a: 1, b: 'x' }));
		expect(res.structuredContent).toEqual({ a: 1, b: 'x' });
	});

	it('toolJson omits structuredContent for non-object payloads', () => {
		expect(toolJson([1, 2, 3]).structuredContent).toBeUndefined();
		expect(toolJson('hello').structuredContent).toBeUndefined();
		expect(toolJson(42).structuredContent).toBeUndefined();
	});

	it('toolOk wraps the success envelope and mirrors it', () => {
		const res = toolOk({ saved: 'note-1' });
		expect(res.structuredContent).toEqual({ ok: true, saved: 'note-1' });
		expect(JSON.parse(res.content[0]!.text)).toEqual({
			ok: true,
			saved: 'note-1',
		});
	});

	it('toolError mirrors the error envelope and sets isError', () => {
		const res = toolError('boom', 'try X');
		expect(res.isError).toBe(true);
		expect(res.structuredContent).toEqual({
			ok: false,
			error: { reason: 'boom', nextAction: 'try X' },
		});
	});

	it('toolError omits nextAction when not given', () => {
		const res = toolError('boom');
		expect(res.structuredContent).toEqual({
			ok: false,
			error: { reason: 'boom' },
		});
	});

	it('text and structuredContent stay consistent', () => {
		const res = toolOk({ n: 7 });
		expect(JSON.parse(res.content[0]!.text)).toEqual(res.structuredContent);
	});

	it('toolErrorWithLogHint attaches the hint and keeps the envelope', () => {
		const hint = {
			path: '/abs/.cache/mcp-vertex/logs/2026-06-21.jsonl',
			line: 17,
			ts: '2026-06-21T18:53:21.758Z',
		};
		const res = toolErrorWithLogHint('boom', hint, 'try X');
		expect(res.isError).toBe(true);
		expect(res.structuredContent).toEqual({
			ok: false,
			error: { reason: 'boom', nextAction: 'try X' },
			logHint: hint,
		});
		expect(JSON.parse(res.content[0]!.text)).toEqual(res.structuredContent);
	});

	it('toolErrorWithLogHint omits nextAction when not given', () => {
		const hint = {
			path: '/abs/.cache/mcp-vertex/logs/2026-06-21.jsonl',
			line: 1,
			ts: '2026-06-21T18:53:21.758Z',
		};
		const res = toolErrorWithLogHint('boom', hint);
		expect(res.structuredContent).toEqual({
			ok: false,
			error: { reason: 'boom' },
			logHint: hint,
		});
	});
});
