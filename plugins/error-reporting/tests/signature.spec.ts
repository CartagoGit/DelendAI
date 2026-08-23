import { describe, expect, it } from 'vitest';

import {
	buildIssueBody,
	buildIssueTitle,
	isMcpVertexInternal,
	normalizeMessage,
	signatureOf,
} from '../src/lib/signature.helper';

describe('isMcpVertexInternal', () => {
	it('detects a stack trace originating inside mcp-vertex', () => {
		const error = new Error('invariant violated');
		error.stack = [
			'Error: invariant violated',
			'    at Plugin.register (/home/u/app/node_modules/@mcp-vertex/issues/dist/index.js:12:3)',
		].join('\n');
		expect(isMcpVertexInternal(error)).toBe(true);
	});

	it('detects the package scope in the message alone', () => {
		expect(
			isMcpVertexInternal(
				new Error('plugin "@mcp-vertex/issues" failed to load'),
			),
		).toBe(true);
	});

	it('ignores host-project failures with no mcp-vertex marker', () => {
		const error = new Error("Cannot read file './src/app.ts'");
		error.stack = [
			'Error: Cannot read file',
			'    at doThing (/home/u/app/src/app.ts:4:2)',
		].join('\n');
		expect(isMcpVertexInternal(error)).toBe(false);
	});
});

describe('normalizeMessage / signatureOf', () => {
	it('collapses numbers, hex and paths into stable placeholders', () => {
		const a = normalizeMessage(
			'port 5432 refused at 0xdeadbeef in /home/alice/proj',
		);
		const b = normalizeMessage(
			'port 9999 refused at 0x1234abcd in /srv/bob/proj',
		);
		expect(a).toBe(b);
	});

	it('produces the same signature for the same bug with different timestamps', () => {
		const e1 = new Error('timeout after 1200ms in /a/b');
		const e2 = new Error('timeout after 3ms in /x/y/z');
		expect(signatureOf('quality_run_quality', e1)).toBe(
			signatureOf('quality_run_quality', e2),
		);
	});

	it('differs across tools', () => {
		const error = new Error('boom');
		expect(signatureOf('search_search', error)).not.toBe(
			signatureOf('git_diff', error),
		);
	});
});

describe('buildIssueTitle / buildIssueBody', () => {
	it('prefixes the title and bounds its length', () => {
		const long = new Error(`x${'y'.repeat(300)}`);
		const title = buildIssueTitle('tool_x', long);
		expect(title.startsWith('[auto] tool_x:')).toBe(true);
		expect(title.length).toBeLessThanOrEqual(180);
	});

	it('renders detail, stack and opt-out instructions', () => {
		const error = new Error('boom');
		error.stack = 'Error: boom\n    at x.ts:1';
		const body = buildIssueBody({
			toolName: 'tool_x',
			error,
			signature: 'tool_x::boom',
			argsJson: '{"a":1}',
			elapsedMs: 42,
			ts: '2026-08-24T00:00:00.000Z',
			namespacePrefix: 'mcp-vertex',
		});
		expect(body).toContain('Automatic error report');
		expect(body).toContain('tool_x::boom');
		expect(body).toContain('boom');
		expect(body).toContain('Error: boom');
		expect(body).toContain('"enabled": false');
	});
});
