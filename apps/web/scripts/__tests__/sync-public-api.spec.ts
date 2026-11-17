import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { apiDocsProblem, ensureFreshApiDocs } from '../sync-public-api.ts';

describe('apiDocsProblem', () => {
	it('fails when the docs are missing [<20ms]', () => {
		expect(apiDocsProblem(null, 10)).toBe(
			'API docs are missing (no index.html)',
		);
	});
	it('fails when the docs are older than the code [<20ms]', () => {
		expect(apiDocsProblem(5, 10)).toBe('API docs are older than the code');
	});
	it('accepts docs at least as new as the code [<20ms]', () => {
		expect(apiDocsProblem(10, 10)).toBeNull();
	});
});

describe('ensureFreshApiDocs [<100ms]', () => {
	const mk = (): string => mkdtempSync(join(tmpdir(), 'spa-'));
	const setup = () => {
		const root = mk();
		const pk = join(root, 'packages');
		const docs = join(root, 'docs');
		mkdirSync(join(pk, 'a', 'src'), { recursive: true });
		mkdirSync(join(pk, 'a', 'node_modules'), { recursive: true });
		mkdirSync(join(pk, 'b'), { recursive: true });
		mkdirSync(docs);
		writeFileSync(join(pk, 'a', 'src', 'x.ts'), '');
		writeFileSync(join(pk, 'a', 'node_modules', 'skip.ts'), '');
		return { root, pk, docs };
	};
	it('regenerates missing docs and reports success [<100ms]', () => {
		const { pk, docs } = setup();
		const out = ensureFreshApiDocs(docs, pk, () =>
			writeFileSync(join(docs, 'index.html'), ''),
		);
		expect(out).toBeNull();
	});
	it('reports docs still missing after regeneration [<100ms]', () => {
		const { pk, docs } = setup();
		expect(ensureFreshApiDocs(docs, pk, () => {})).toBe(
			'API docs are missing (no index.html)',
		);
	});
	it('does not regenerate current docs [<100ms]', () => {
		const { pk, docs } = setup();
		writeFileSync(join(docs, 'index.html'), '');
		const future = new Date(Date.now() + 5000);
		utimesSync(join(docs, 'index.html'), future, future);
		let ran = false;
		expect(
			ensureFreshApiDocs(docs, pk, () => {
				ran = true;
			}),
		).toBeNull();
		expect(ran).toBe(false);
	});
	it('flags docs older than the code [<100ms]', () => {
		const { pk, docs } = setup();
		writeFileSync(join(docs, 'index.html'), '');
		const past = new Date(Date.now() - 50000);
		utimesSync(join(docs, 'index.html'), past, past);
		expect(ensureFreshApiDocs(docs, pk, () => {})).toBe(
			'API docs are older than the code',
		);
	});
});
