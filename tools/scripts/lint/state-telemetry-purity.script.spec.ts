import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	scanProjectorPurity,
	scanSource,
} from './state-telemetry-purity.script';

describe('state-telemetry-purity lint', () => {
	let root = '';
	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'state-telemetry-purity-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('flags an await inside rebuild but not outside it', () => {
		const body = [
			'export const p = {',
			'\trebuild: (ctx) => {',
			'\t\tconst x = await load(ctx);',
			'\t\treturn x;',
			'\t},',
			'};',
			'export const later = async () => { await Promise.resolve(); };',
		].join('\n');
		const findings = scanSource('a.ts', body);
		expect(findings).toHaveLength(1);
		expect(findings[0]).toMatchObject({
			line: 3,
			reason: '`await` inside rebuild/reconcile',
		});
	});

	it('flags an await inside reconcile written as a method', () => {
		const body =
			'const p = {\n\treconcile(ctx, change) {\n\t\tawait x();\n\t},\n};\n';
		expect(scanSource('a.ts', body)).toHaveLength(1);
	});

	it('flags a persistent I/O import', () => {
		expect(
			scanSource('a.ts', "import { readFileSync } from 'node:fs';\n"),
		).toHaveLength(1);
		expect(
			scanSource('a.ts', "import { join } from 'node:path';\n"),
		).toHaveLength(0);
	});

	it('scans the projector folder only and skips specs', async () => {
		write(
			'packages/state-telemetry/src/lib/projector/bad.service.ts',
			"import 'fs';\nimport fs from 'fs';\n",
		);
		write(
			'packages/state-telemetry/src/lib/projector/bad.service.spec.ts',
			"import fs from 'fs';\n",
		);
		write(
			'packages/state-telemetry/src/lib/other/io.ts',
			"import fs from 'fs';\n",
		);
		const findings = await scanProjectorPurity(root);
		expect(findings.map((f) => f.relPath)).toEqual([
			'packages/state-telemetry/src/lib/projector/bad.service.ts',
		]);
	});

	it('accepts a clean tree', async () => {
		write(
			'packages/state-telemetry/src/lib/projector/ok.service.ts',
			'export const a = 1;\n',
		);
		expect(await scanProjectorPurity(root)).toEqual([]);
	});
});
