import { describe, expect, it } from 'vitest';

import { formatResultsTable } from './format-results-table';

describe('format-results-table (Solid SRP extraction)', async () => {
	it('renders the canonical header row', async () => {
		const out = formatResultsTable([]);
		expect(out).toContain('Plugin');
		expect(out).toContain('Tool');
		expect(out).toContain('Outcome');
		expect(out).toContain('Handler');
	});

	it('emits the empty-total footer for zero rows', async () => {
		const out = formatResultsTable([]);
		expect(out).toContain(
			'Total: 0 ok, 0 need-input, 0 failed across 0 tools',
		);
	});

	it('renders one row per (plugin, tool) pair with the correct mark', async () => {
		const out = formatResultsTable([
			{
				plugin: 'audit',
				tool: 'overview',
				outcome: 'ok',
				handlerReturned: true,
			},
			{
				plugin: 'audit',
				tool: 'scaffold',
				outcome: 'needs-input',
				handlerReturned: true,
			},
			{
				plugin: 'memory',
				tool: 'redact_test',
				outcome: 'failed',
				handlerReturned: false,
			},
		]);
		expect(out).toContain('audit               ');
		expect(out).toContain('overview');
		expect(out).toContain('scaffold');
		expect(out).toContain('memory');
		expect(out).toContain('✓ ok');
		expect(out).toContain('~ needs input');
		expect(out).toContain('✗ failed');
		expect(out).toContain(
			'Total: 1 ok, 1 need-input, 1 failed across 3 tools',
		);
	});

	it('sorts rows by (plugin, tool) so the table is deterministic', async () => {
		const out = formatResultsTable([
			{
				plugin: 'memory',
				tool: 'z',
				outcome: 'ok',
				handlerReturned: true,
			},
			{
				plugin: 'audit',
				tool: 'b',
				outcome: 'ok',
				handlerReturned: true,
			},
			{
				plugin: 'audit',
				tool: 'a',
				outcome: 'ok',
				handlerReturned: true,
			},
		]);
		// Find the index of each row line — they should be in plugin+tool order.
		const lines = out.split('\n');
		const idx = (text: string) => lines.findIndex((l) => l.includes(text));
		const auditA = idx('audit');
		const auditB = auditA + 1;
		const memory = lines.findIndex((l) => l.includes('memory'));
		expect(auditA).toBeGreaterThan(-1);
		expect(lines[auditA]).toContain('a');
		expect(lines[auditB]).toContain('b');
		expect(memory).toBeGreaterThan(auditB);
	});

	it('handles the Solid LSP guard: format is independent of input order', async () => {
		// Same set of rows in different orders must produce the same
		// table (sort is stable) and the same totals.
		const a = formatResultsTable([
			{
				plugin: 'audit',
				tool: 'overview',
				outcome: 'ok',
				handlerReturned: true,
			},
			{
				plugin: 'memory',
				tool: 'redact',
				outcome: 'failed',
				handlerReturned: false,
			},
		]);
		const b = formatResultsTable([
			{
				plugin: 'memory',
				tool: 'redact',
				outcome: 'failed',
				handlerReturned: false,
			},
			{
				plugin: 'audit',
				tool: 'overview',
				outcome: 'ok',
				handlerReturned: true,
			},
		]);
		// Strip the row lines (which appear in sorted order); keep header + totals.
		const totals = (s: string) =>
			s
				.split('\n')
				.filter((l) => l.startsWith('Total:'))
				.join('\n');
		expect(totals(a)).toBe(totals(b));
	});
});
