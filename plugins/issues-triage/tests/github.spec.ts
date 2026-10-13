import { describe, expect, it } from 'vitest';

import {
	addComment,
	addLabels,
	fetchIssue,
	listOpenIssues,
} from '../src/lib/github.service';
import type { IGhExec } from '../src/lib/contracts/interfaces/github.interface';

const ok =
	(stdout: string): IGhExec =>
	async () => ({
		ok: true,
		code: 0,
		stdout,
		stderr: '',
	});

describe('listOpenIssues', () => {
	it('parses gh issue list JSON', async () => {
		const exec = ok(
			'[{"number":1,"title":"boom","labels":[{"name":"bug"}],"updatedAt":"2026-08-24T00:00:00Z"}]',
		);
		const result = await listOpenIssues('o/r', exec);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data).toHaveLength(1);
			expect(result.data[0]?.number).toBe(1);
			expect(result.data[0]?.labels).toEqual(['bug']);
		}
	});

	it('returns a failure envelope when gh exits non-zero', async () => {
		const exec: IGhExec = async () => ({
			ok: false,
			code: 1,
			stdout: '',
			stderr: 'gh auth required',
		});
		const result = await listOpenIssues('o/r', exec);
		expect(result.ok).toBe(false);
	});
});

describe('fetchIssue', () => {
	it('detects a previous bot reply via the marker', async () => {
		const exec = ok(
			JSON.stringify({
				number: 3,
				title: 't',
				body: 'b',
				labels: [],
				comments: [
					{ body: 'A human note' },
					{ body: '> 🤖 @delendai/issues-triage classified this' },
				],
			}),
		);
		const result = await fetchIssue('o/r', 3, exec);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.data.hasBotReply).toBe(true);
			expect(result.data.commentCount).toBe(2);
		}
	});
});

describe('addComment', () => {
	it('sends the comment and parses the url', async () => {
		let captured: readonly string[] = [];
		const exec: IGhExec = async (argv) => {
			captured = argv;
			return {
				ok: true,
				code: 0,
				stdout: 'https://github.com/o/r/issues/9#issuecomment-1\n',
				stderr: '',
			};
		};
		const result = await addComment('o/r', 9, 'hello', exec);
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.data.number).toBe(9);
		expect(captured.join(' ')).toContain('issue comment 9');
		expect(captured.join(' ')).toContain('--body hello');
	});
});

describe('addLabels', () => {
	it('is a no-op for an empty label list', async () => {
		const result = await addLabels('o/r', 1, [], ok(''));
		expect(result.ok).toBe(true);
	});
});
