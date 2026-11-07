import { describe, expect, it } from 'vitest';

import { projectValue } from '@delendai/core/public';

interface ISampleTool {
	readonly id: string;
	readonly name: string;
	readonly plugin: string;
	readonly summary: string;
	readonly sinceVersion: string;
	readonly semverGuarantee: string;
	readonly inputSchema: Record<string, unknown>;
	readonly outputSchema: Record<string, unknown>;
}

const tool = (overrides: Partial<ISampleTool> = {}): ISampleTool => ({
	id: 'delendai_proposals_auto_work',
	name: 'auto_work',
	plugin: 'proposals',
	summary: 'orient a swarm',
	sinceVersion: '0.1.0',
	semverGuarantee: 'minor',
	inputSchema: { type: 'object' },
	outputSchema: { type: 'object' },
	...overrides,
});

describe('projection — v00133 S2', () => {
	it('returns the full payload when mode is full', () => {
		const source = tool();
		const result = projectValue(source, { mode: 'full' });
		expect(result.mode).toBe('full');
		expect(result.fields).toBeNull();
		expect(result.truncated).toBe(false);
		expect(result.truncatedByLimit).toBe(false);
		expect(result.truncatedByBytes).toBe(false);
		expect(result.value).toEqual(source);
	});

	it('returns the curated compact subset when mode is compact and fields is absent', () => {
		const result = projectValue(tool(), { mode: 'compact' });
		expect(result.mode).toBe('compact');
		expect(
			Object.keys(
				result.value as unknown as Record<string, unknown>,
			).sort(),
		).toEqual(['id', 'name', 'plugin', 'summary']);
	});

	it('honors an explicit fields allow-list', () => {
		const result = projectValue(tool(), {
			fields: ['id', 'plugin', 'sinceVersion'],
		});
		expect(
			Object.keys(
				result.value as unknown as Record<string, unknown>,
			).sort(),
		).toEqual(['id', 'plugin', 'sinceVersion']);
		expect(result.fields).toEqual(['id', 'plugin', 'sinceVersion']);
	});

	it('truncates arrays with maxBytes and emits nextCursor', () => {
		const rows = Array.from({ length: 50 }, (_, index) =>
			tool({ id: `tool-${index}` }),
		);
		const result = projectValue(rows, { limit: 10, maxBytes: 128 });
		expect(result.limit).toBe(10);
		expect(result.truncated).toBe(true);
		expect(result.truncatedByLimit).toBe(true);
		expect(result.truncatedByBytes).toBe(true);
		expect((result.value as readonly unknown[]).length).toBeLessThanOrEqual(
			10,
		);
		expect(result.emittedBytes).toBeLessThanOrEqual(128);
		expect(result.nextCursor).toBe('offset:10');
	});

	it('marks object projections truncatedByBytes when maxBytes is too small', () => {
		const result = projectValue(tool({ summary: 'x'.repeat(256) }), {
			maxBytes: 64,
		});
		expect(result.truncated).toBe(true);
		expect(result.truncatedByLimit).toBe(false);
		expect(result.truncatedByBytes).toBe(true);
		expect(result.value).toBeNull();
	});

	it('keeps the cursor opaque and emits it verbatim', () => {
		const opaque = 'eyJpZCI6Im0wMDAwMCJ9|agent=hawk';
		const result = projectValue(tool(), { cursor: opaque });
		expect(result.cursor).toBe(opaque);
		expect(result.nextCursor).toBeNull();
	});

	it('does not truncate when maxBytes is generous', () => {
		const rows = Array.from({ length: 5 }, (_, index) =>
			tool({ id: `tool-${index}` }),
		);
		const result = projectValue(rows, { maxBytes: 64 * 1024 });
		expect(result.truncated).toBe(false);
		expect((result.value as readonly unknown[]).length).toBe(5);
	});

	it('keeps full fallback compatible when mode is full and a fields list is also provided', () => {
		const result = projectValue(tool(), {
			mode: 'full',
			fields: ['id'],
		});
		expect(result.mode).toBe('full');
		expect(result.fields).toEqual(['id']);
		expect(
			Object.keys(result.value as unknown as Record<string, unknown>),
		).toEqual(['id']);
	});
});
