/**
 * inlined-packages.spec.ts — a published package carries the private
 * packages it uses, and says which public ones that obliges it to declare.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	importedBySources,
	inlinedPackagesOf,
	type IWorkspaceManifest,
	undeclaredByPublisher,
} from './inlined-packages';

const workspace = new Map<string, IWorkspaceManifest>(
	[
		{
			name: '@x/cli',
			devDependencies: { '@x/telemetry': '*', '@x/kit': '*' },
		},
		{
			name: '@x/telemetry',
			private: true,
			dependencies: { '@x/state': '*', '@x/store': '*' },
		},
		{ name: '@x/store', private: true },
		{ name: '@x/state' },
		{ name: '@x/kit', private: true },
	].map((manifest) => [manifest.name, manifest] as const),
);
const cli = (over: Partial<IWorkspaceManifest> = {}): IWorkspaceManifest => ({
	...(workspace.get('@x/cli') ?? { name: '@x/cli' }),
	...over,
});

describe('inlinedPackagesOf', () => {
	it('takes the private packages it declares for development, and theirs', () => {
		expect(inlinedPackagesOf(cli(), workspace)).toEqual([
			'@x/kit',
			'@x/store',
			'@x/telemetry',
		]);
	});

	it('leaves a public package to the registry', () => {
		expect(
			inlinedPackagesOf(
				cli({ devDependencies: { '@x/state': '*' } }),
				workspace,
			),
		).toEqual([]);
	});

	it('bundles nothing into a package that is not published', () => {
		expect(inlinedPackagesOf(cli({ private: true }), workspace)).toEqual(
			[],
		);
	});
});

describe('undeclaredByPublisher', () => {
	it('names the public package an inlined one imports and the publisher lacks', () => {
		expect(undeclaredByPublisher(cli(), workspace)).toEqual(['@x/state']);
	});

	it('is satisfied once the publisher declares it', () => {
		expect(
			undeclaredByPublisher(
				cli({ dependencies: { '@x/state': '*' } }),
				workspace,
			),
		).toEqual([]);
	});
});

describe('importedBySources', () => {
	it('names what the shipped sources import, not what only a test does', () => {
		const src = mkdtempSync(join(tmpdir(), 'inlined-src-'));
		try {
			mkdirSync(join(src, 'lib'));
			writeFileSync(
				join(src, 'index.ts'),
				"import { view } from '@x/telemetry/public';\nexport const v = view;\n",
			);
			writeFileSync(
				join(src, 'lib', 'lazy.ts'),
				"export const load = () => import('@x/store');\n",
			);
			writeFileSync(
				join(src, 'lib', 'thing.spec.ts'),
				"import { fake } from '@x/kit';\n",
			);

			expect(
				importedBySources(src, [
					'@x/telemetry',
					'@x/store',
					'@x/kit',
					'@x/tele',
				]),
			).toEqual(['@x/telemetry', '@x/store']);
		} finally {
			rmSync(src, { recursive: true, force: true });
		}
	});

	it('is empty for a package with no sources or no candidates', () => {
		expect(importedBySources('/nowhere/src', ['@x/kit'])).toEqual([]);
		expect(importedBySources('/nowhere/src', [])).toEqual([]);
	});
});
