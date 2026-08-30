import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	detectProposalIdComments,
	scanText,
	formatReport,
	loadBaseline,
} from './no-proposal-id-comments-in-source.script';

const VENDOR_ROOT = join(tmpdir(), `c00141-${Date.now()}`);

const cleanupVendorRoot = async (): Promise<void> => {
	await rm(VENDOR_ROOT, { recursive: true, force: true });
};

describe('no-proposal-id-comments-in-source.script (c00141)', () => {
	it('flags a single-line proposal-id comment', () => {
		const findings = scanText(
			[
				'export const x = 1;',
				'// f00087 S2: rewrite this fallback',
				'',
			].join('\n'),
			'/repo/x.ts',
			'x.ts',
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.proposalPrefix).toBe('f');
		expect(findings[0]?.proposalDigits).toBe('00087');
		expect(findings[0]?.line).toBe(2);
	});

	it('flags the dash-separator variant (`// b00236 — predecessor`)', () => {
		const findings = scanText(
			'// x00241: SafeWorkspaceReader — primitive base\nconst y = 2;\n',
			'/repo/y.ts',
			'y.ts',
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.proposalPrefix).toBe('x');
		expect(findings[0]?.proposalDigits).toBe('00241');
	});

	it('flags the variant without a separator at EOL', () => {
		const findings = scanText(
			'export const z = 3; // f00001\n',
			'/repo/z.ts',
			'z.ts',
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.proposalDigits).toBe('00001');
	});

	it('does NOT flag a TODO / FIXME / NOTE comment even when it contains digits', () => {
		const findings = scanText(
			'// TODO: revisit the f00087 plan once the model is finalized\n',
			'/repo/todo.ts',
			'todo.ts',
		);
		expect(findings).toHaveLength(0);
	});

	it('does NOT flag a `// repro for xNNNNN` style marker in test specs', () => {
		const findings = scanText(
			'// repro for x00241 — see also fixtures/spec/x00241.ts\n',
			'/repo/x.spec.ts',
			'x.spec.ts',
		);
		expect(findings).toHaveLength(0);
	});

	it('does NOT flag a `@ts-expect-error` directive that mentions an id', () => {
		const findings = scanText(
			'// @ts-expect-error f00123 — narrower return type is fine\n',
			'/repo/d.ts',
			'd.ts',
		);
		expect(findings).toHaveLength(0);
	});

	it('does NOT flag identifiers or imports that contain a 5-digit substring', () => {
		const findings = scanText(
			'import { foo12345 } from "@scope/bar12345";\nconst x = 12345;\n',
			'/repo/n.ts',
			'n.ts',
		);
		expect(findings).toHaveLength(0);
	});

	it('does NOT flag a comment whose id is missing a separator token', () => {
		// `// f00103a` does not match — there is no separator right after
		// the digits (a letter follows immediately), so it cannot be a
		// proposal-id reference. Future padding changes are safe.
		const findings = scanText(
			'// f00103a: same as above\n',
			'/repo/s.ts',
			's.ts',
		);
		expect(findings).toHaveLength(0);
	});

	it('flags multiple matches on multiple lines', () => {
		const findings = scanText(
			`${[
				'// a00012: comment one',
				'export const x = 1;',
				'// b00034: comment two',
				'// c00056', // colon-only separator is supported
			].join('\n')}\n`,
			'/repo/m.ts',
			'm.ts',
		);
		expect(findings.map((f) => f.proposalDigits)).toEqual([
			'00012',
			'00034',
			'00056',
		]);
	});

	it('the 4-digit legacy form `c0014` is also caught', () => {
		const findings = scanText(
			'// c9999 S2: cleanup\n',
			'/repo/legacy.ts',
			'legacy.ts',
		);
		expect(findings).toHaveLength(1);
		expect(findings[0]?.proposalDigits).toBe('9999');
	});

	it('a 3-digit form (not a proposal) is NOT flagged', () => {
		const findings = scanText(
			'// x123: too short\n',
			'/repo/short.ts',
			'short.ts',
		);
		expect(findings).toHaveLength(0);
	});
});

describe('loadBaseline', () => {
	it('returns an empty map for a missing baseline (first-run behavior)', async () => {
		const map = await loadBaseline(join(VENDOR_ROOT, 'missing.json'));
		expect(map.size).toBe(0);
	});

	it('parses a baseline file and exposes file→lines map', async () => {
		const path = join(VENDOR_ROOT, 'baseline.json');
		await mkdir(VENDOR_ROOT, { recursive: true });
		await writeFile(
			path,
			`${JSON.stringify(
				[
					{ path: 'a.ts', lines: [10, 20], reason: 'legacy' },
					{ path: 'b.ts', lines: [5], reason: 'legacy' },
				],
				null,
				2,
			)}\n`,
		);
		const map = await loadBaseline(path);
		expect(map.size).toBe(2);
		expect([...(map.get('a.ts') ?? [])]).toEqual([10, 20]);
		expect([...(map.get('b.ts') ?? [])]).toEqual([5]);
	});

	cleanupVendorRoot();
});

describe('formatReport', () => {
	it('prints a friendly zero-violations message', () => {
		const out = formatReport({
			findings: [],
			baselineSuppressed: 0,
			ok: true,
		});
		expect(out).toContain('0 violations');
	});

	it('lists each violation with path:line:col when not OK', () => {
		const out = formatReport({
			findings: [
				{
					absPath: '/repo/x.ts',
					relPath: 'x.ts',
					line: 5,
					column: 3,
					match: '// f00087 S2: …',
					proposalPrefix: 'f',
					proposalDigits: '00087',
				},
			],
			baselineSuppressed: 0,
			ok: false,
		});
		expect(out).toContain('x.ts:5:3');
		expect(out).toContain('f00087');
	});
});

describe('detectProposalIdComments over a vendor root', () => {
	it('walks a vendor root and reports matching violations', async () => {
		await mkdir(VENDOR_ROOT, { recursive: true });
		await writeFile(
			join(VENDOR_ROOT, 'a.ts'),
			'// f00001 S2: cleanup the legacy path\nconst x = 1;\n',
		);
		await writeFile(
			join(VENDOR_ROOT, 'b.spec.ts'),
			'// f00002: hidden in test (should be skipped)\nconst y = 2;\n',
		);
		await writeFile(
			join(VENDOR_ROOT, 'c.ts'),
			'// TODO: revisit f00003 if the schema lands\nconst z = 3;\n',
		);
		const result = await detectProposalIdComments({ roots: [VENDOR_ROOT] });
		expect(result.ok).toBe(false);
		// `relPath` is relative to the cwd (REPO_ROOT), and the vendor
		// root lives under /tmp/… — what matters is the basename.
		expect(result.findings.map((f) => f.relPath.split('/').pop())).toEqual([
			'a.ts',
		]);
	});
});

void cleanupVendorRoot;
