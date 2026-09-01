import {
	mkdtempSync,
	mkdirSync,
	rmSync,
	writeFileSync,
	readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { countViolations, scanViolations } from './type-naming.script';

describe('type-naming lint — pure engine', () => {
	it('accepts an I-prefixed interface', () => {
		expect(countViolations('export interface IThing { a: string }\n')).toBe(
			0,
		);
	});

	it('flags a non-compliant type alias', () => {
		expect(countViolations('export type Thing = string;\n')).toBe(1);
	});

	it('flags a non-compliant interface', () => {
		expect(countViolations('export interface Thing { a: string }\n')).toBe(
			1,
		);
	});

	it('flags a non-compliant generic type alias', () => {
		expect(countViolations('export type Box<T> = { value: T };\n')).toBe(1);
	});

	it('flags a multi-line interface body by its declaration line', () => {
		const body = [
			'export interface Thing',
			'\textends Base {',
			'\ta: string;',
			'}',
			'',
		].join('\n');
		expect(countViolations(body)).toBe(1);
	});

	it('flags non-compliant names inside an internal type re-export list', () => {
		const body =
			"export type { Thing, IOk, Other as Named } from './local';\n";
		// Thing -> violation, IOk -> compliant, Named -> violation
		expect(countViolations(body)).toBe(2);
	});

	it('exempts a type re-export list from a genuine third-party package', () => {
		const body = "export type { Thing, Other } from 'zod';\n";
		expect(countViolations(body)).toBe(0);
	});

	it('still lints a re-export through an internal path alias', () => {
		const body = "export type { Thing } from '@mcp-vertex/core';\n";
		expect(countViolations(body)).toBe(1);
	});
});

describe('type-naming lint — file scan', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'type-naming-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('counts violations across compliant + non-compliant declarations in one file', () => {
		write(
			'packages/foo/src/thing.service.ts',
			'export interface IThing { a: string }\n' +
				'export type Bad = string;\n' +
				'export interface AlsoBad { a: string }\n',
		);
		expect(scanViolations(root)['packages/foo/src/thing.service.ts']).toBe(
			2,
		);
	});

	it('exempts spec/test/d.ts/generated files and generated/ dirs', () => {
		write(
			'packages/foo/src/thing.spec.ts',
			'export interface Fixture {}\n',
		);
		write(
			'packages/foo/src/thing.test.ts',
			'export interface Fixture {}\n',
		);
		write('packages/foo/src/thing.d.ts', 'export interface Fixture {}\n');
		write(
			'packages/foo/src/thing.generated.ts',
			'export interface Fixture {}\n',
		);
		write(
			'packages/core/src/generated/thing.ts',
			'export interface Fixture {}\n',
		);
		expect(scanViolations(root)).toEqual({});
	});

	it('scans tools/ (unlike types-in-contracts, which excludes it)', () => {
		write('tools/scripts/x.ts', 'export interface Local { a: string }\n');
		expect(scanViolations(root)['tools/scripts/x.ts']).toBe(1);
	});

	it('scans .tsx files', () => {
		write(
			'apps/web/src/component.tsx',
			'export interface ThingProps { a: string }\n',
		);
		expect(scanViolations(root)['apps/web/src/component.tsx']).toBe(1);
	});
});

describe('type-naming lint — CLI: baseline round trip via --update', () => {
	let root = '';
	const scriptPath = join(__dirname, 'type-naming.script.ts');

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	const runScript = (
		args: readonly string[],
	): { code: number; stderr: string } => {
		try {
			const stderr = execFileSync('bun', [scriptPath, ...args], {
				cwd: root,
				encoding: 'utf8',
				stdio: ['ignore', 'pipe', 'pipe'],
			});
			return { code: 0, stderr };
		} catch (err) {
			const e = err as { status: number; stderr: Buffer };
			return { code: e.status, stderr: e.stderr.toString() };
		}
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'type-naming-cli-'));
		// repoRoot() shells out to `git rev-parse --show-toplevel` against
		// cwd; without a real repo here it would fall back to resolving
		// *this* checkout and clobber the real baseline. Make the tmp dir
		// its own repo so the CLI is sandboxed to the fixture tree.
		execFileSync('git', ['init', '-q'], { cwd: root });
		// The script writes the baseline via a bare writeFileSync (mirroring
		// types-in-contracts.script.ts), so the target dir must pre-exist —
		// true in the real repo, not true in a fresh tmp fixture.
		mkdirSync(join(root, 'tools/scripts/lint'), { recursive: true });
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('records current violations on --update, then passes clean, then fails on a NEW regression, and allows counts to only decrease', () => {
		write(
			'packages/foo/src/thing.service.ts',
			'export type Bad = string;\nexport type AlsoBad = string;\n',
		);

		const updated = runScript(['--update']);
		expect(updated.code).toBe(0);

		const baselinePath = join(
			root,
			'tools/scripts/lint/type-naming.baseline.json',
		);
		const baseline = JSON.parse(
			readFileSync(baselinePath, 'utf8'),
		) as Record<string, number>;
		expect(baseline['packages/foo/src/thing.service.ts']).toBe(2);

		// Same violation count -> clean run.
		const clean = runScript([]);
		expect(clean.code).toBe(0);

		// A NEW violation added on top of the baselined ones -> regression.
		write(
			'packages/foo/src/thing.service.ts',
			'export type Bad = string;\nexport type AlsoBad = string;\nexport type Newly = string;\n',
		);
		const regressed = runScript([]);
		expect(regressed.code).toBe(1);
		expect(regressed.stderr).toContain('thing.service.ts');

		// Fixing it back down (count DECREASES) must still pass — the
		// baseline is a ceiling, not a floor.
		write(
			'packages/foo/src/thing.service.ts',
			'export type Bad = string;\n',
		);
		const improved = runScript([]);
		expect(improved.code).toBe(0);
	});
});
