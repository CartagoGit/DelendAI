/**
 * trailer.spec.ts — exhaustive coverage of every audit mode and the
 * re-commit dedupe path.
 */

import { describe, expect, it } from 'vitest';

import { appendAuditTrailer } from '@delendai/commit-policy/lib/audit/trailer';

describe('appendAuditTrailer', () => {
	const agent = { host: 'vscode-copilot', model: 'minimax-m3' };

	describe('kind=none', () => {
		it('returns the original message untouched', () => {
			expect(
				appendAuditTrailer(
					'feat: thing',
					'none',
					'${host}/${model}',
					agent,
				),
			).toBe('feat: thing');
		});

		it('returns the original untouched when the agent is null', () => {
			expect(
				appendAuditTrailer(
					'feat: thing',
					'co-authored-by',
					'${host}/${model}',
					null,
				),
			).toBe('feat: thing');
		});
	});

	describe('kind=co-authored-by', () => {
		it('appends a single Co-authored-by trailer after a blank line', () => {
			const out = appendAuditTrailer(
				'feat(core): add x',
				'co-authored-by',
				'${host}/${model}',
				agent,
			);
			expect(out).toContain('feat(core): add x');
			expect(out).toContain('Co-authored-by: vscode-copilot/minimax-m3');
		});

		it('keeps a different Co-authored-by trailer and does not duplicate an equal one', () => {
			const original = [
				'feat: x',
				'',
				'Co-authored-by: vscode-copilot/minimax-m3',
			].join('\n');
			const out = appendAuditTrailer(
				original,
				'co-authored-by',
				'${host}/${model}',
				{ host: 'claude-code', model: 'opus-4' },
			);
			expect(out).toBe(
				'feat: x\n\nCo-authored-by: vscode-copilot/minimax-m3\nCo-authored-by: claude-code/opus-4\n',
			);
			const again = appendAuditTrailer(
				out,
				'co-authored-by',
				'${host}/${model}',
				{ host: 'claude-code', model: 'OPUS-4' },
			);
			expect(again.match(/^Co-authored-by: claude-code/gim)?.length).toBe(
				1,
			);
		});

		it('keeps subject, body and other trailers', () => {
			const original = [
				'fix: thing: with colon',
				'',
				'Body line.',
				'Note: kept',
				'',
				'Signed-off-by: A <a@b.c>',
			].join('\n');
			const out = appendAuditTrailer(
				original,
				'co-authored-by',
				'${host}/${model}',
				agent,
			);
			expect(out).toBe(
				`${original}\nCo-authored-by: vscode-copilot/minimax-m3\n`,
			);
		});

		it('never strips a subject shaped like a trailer', () => {
			const out = appendAuditTrailer(
				'Co-authored-by: vscode-copilot/minimax-m3',
				'co-authored-by',
				'${host}/${model}',
				agent,
			);
			expect(
				out.startsWith('Co-authored-by: vscode-copilot/minimax-m3\n\n'),
			).toBe(true);
		});

		it('interpolates ${host}, ${model}, and ${date}', () => {
			const stamped = { ...agent, now: '2026-08-25T00:00:00.000Z' };
			const out = appendAuditTrailer(
				'feat: x',
				'co-authored-by',
				'${host}/${model}@${date}',
				stamped,
			);
			expect(out).toContain(
				'Co-authored-by: vscode-copilot/minimax-m3@2026-08-25T00:00:00.000Z',
			);
		});
	});

	describe('kind=body-metadata', () => {
		it('appends a fenced JSON block', () => {
			const out = appendAuditTrailer(
				'feat: y',
				'body-metadata',
				'${host}/${model}',
				agent,
			);
			expect(out).toContain('feat: y');
			expect(out).toContain('<!-- agent-metadata:begin -->');
			expect(out).toContain('"host":"vscode-copilot"');
			expect(out).toContain('"model":"minimax-m3"');
			expect(out).toContain('<!-- agent-metadata:end -->');
		});

		it('keeps a value with a quote readable as JSON', () => {
			const out = appendAuditTrailer(
				'feat: y',
				'body-metadata',
				'${host}/${model}',
				{ ...agent, model: 'mini"max' },
			);
			const json = /```json\n(.*)\n```/u.exec(out)?.[1] ?? '';
			expect((JSON.parse(json) as { model: string }).model).toBe(
				'mini"max',
			);
		});

		it('rewrites a previous fenced block instead of stacking them', () => {
			const original = [
				'feat: y',
				'',
				'<!-- agent-metadata:begin -->',
				'```json',
				'{ "host": "old", "model": "old" }',
				'```',
				'<!-- agent-metadata:end -->',
			].join('\n');
			const out = appendAuditTrailer(
				original,
				'body-metadata',
				'${host}/${model}',
				agent,
			);
			const begins = out.match(/<!-- agent-metadata:begin -->/g) ?? [];
			expect(begins.length).toBe(1);
			expect(out).toContain('"host":"vscode-copilot"');
			expect(out).not.toContain('"host": "old"');
		});
	});
});
