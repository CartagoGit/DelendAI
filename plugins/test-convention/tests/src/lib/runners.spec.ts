import { describe, expect, it } from 'vitest';

import type { IFileReader } from '@mcp-vertex/core/public';

import { detectRunner } from '@mcp-vertex/test-convention/public';

const reader = (files: Record<string, string>): IFileReader => ({
	readFile: (p) => files[p],
	exists: (p) => p in files,
	listDir: () => Object.keys(files),
});

describe('detectRunner', () => {
	it('returns vitest when vitest.config.ts exists', () => {
		const r = detectRunner(reader({ 'vitest.config.ts': '' }));
		expect(r.name).toBe('vitest');
		expect(r.mockApi).toBe('vi');
	});

	it('returns vitest when package.json scripts.test includes vitest', () => {
		const r = detectRunner(
			reader({
				'package.json': JSON.stringify({
					scripts: { test: 'vitest run' },
				}),
			}),
		);
		expect(r.name).toBe('vitest');
		expect(r.evidence).toBe('scripts.test');
	});

	it('returns jest when jest.config.ts exists', () => {
		const r = detectRunner(reader({ 'jest.config.ts': '' }));
		expect(r.name).toBe('jest');
		expect(r.mockApi).toBe('jest');
	});

	it('returns jest when scripts.test mentions jest', () => {
		const r = detectRunner(
			reader({
				'package.json': JSON.stringify({ scripts: { test: 'jest' } }),
			}),
		);
		expect(r.name).toBe('jest');
	});

	it('returns unknown when nothing matches', () => {
		const r = detectRunner(reader({}));
		expect(r.name).toBe('unknown');
		expect(r.evidence).toBe('none');
	});

	it('ignores malformed package.json', () => {
		const r = detectRunner(reader({ 'package.json': '{not json' }));
		expect(r.name).toBe('unknown');
	});
});
