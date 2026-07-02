import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { scanViolations } from './types-in-contracts.script';

describe('types-in-contracts lint', () => {
	let root = '';

	const write = (rel: string, body: string): void => {
		const abs = join(root, rel);
		mkdirSync(dirname(abs), { recursive: true });
		writeFileSync(abs, body, 'utf8');
	};

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'types-in-contracts-'));
	});
	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('counts inline exported interfaces/types + SCREAMING consts in product source', () => {
		write(
			'packages/foo/src/thing.service.ts',
			'export interface IThing { a: string }\n' +
				'export type TThing = string;\n' +
				'export const MAX_THINGS = 3;\n' +
				'export const helper = () => 1;\n', // not a SCREAMING const → not a violation
		);
		const result = scanViolations(root);
		expect(result['packages/foo/src/thing.service.ts']).toBe(3);
	});

	it('exempts contracts/interfaces, *.interface.ts, *.constant.ts, and specs', () => {
		write(
			'packages/foo/src/contracts/interfaces/thing.interface.ts',
			'export interface IThing { a: string }\n',
		);
		write('packages/foo/src/thing.constant.ts', 'export const MAX = 1;\n');
		write(
			'packages/foo/src/thing.spec.ts',
			'export interface IFixture { a: string }\n',
		);
		expect(scanViolations(root)).toEqual({});
	});

	it('ignores files outside the scanned product roots (e.g. tools/)', () => {
		write('tools/scripts/x.ts', 'export interface ILocal { a: string }\n');
		expect(scanViolations(root)).toEqual({});
	});
});
