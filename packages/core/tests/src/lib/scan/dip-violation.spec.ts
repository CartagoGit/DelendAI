import { describe, expect, it } from 'vitest';

import { detectDipViolations } from '../../../../src/lib/scan/dip-violation';

describe('scan/dip-violation — detectDipViolations', () => {
	it('flags process.cwd() in a plugin source', () => {
		const body = 'export const path = process.cwd();';
		const hits = detectDipViolations(
			'plugins/example/src/lib/foo.ts',
			body,
		);
		expect(hits).toHaveLength(1);
		expect(hits[0]?.kind).toBe('process-cwd');
	});

	it('does not flag a clean plugin', () => {
		const body = [
			"import { join } from 'node:path';",
			"import { readFile } from 'node:fs/promises';",
			'export const read = (p: string) => readFile(join(ctx.workspace, p));',
		].join('\n');
		const hits = detectDipViolations(
			'plugins/example/src/lib/foo.ts',
			body,
		);
		expect(hits).toHaveLength(0);
	});

	it('flags a sync readFileSync import in a plugin', () => {
		const body = [
			"import { readFileSync } from 'node:fs';",
			'export const read = (p: string) => readFileSync(p);',
		].join('\n');
		const hits = detectDipViolations(
			'plugins/example/src/lib/foo.ts',
			body,
		);
		expect(hits.some((h) => h.kind === 'sync-fs-import')).toBe(true);
	});

	it('does not flag paths outside plugin/core scope', () => {
		const body = 'export const path = process.cwd();';
		const hits = detectDipViolations('docs/some/notes.md', body);
		expect(hits).toHaveLength(0);
	});

	it('does not flag the boot-time configuration-center', () => {
		const body = [
			"import { readFileSync } from 'node:fs';",
			'export const cfg = readFileSync(bootPath);',
		].join('\n');
		const hits = detectDipViolations(
			'packages/core/src/lib/configuration-center/loader.ts',
			body,
		);
		expect(hits).toHaveLength(0);
	});
});
