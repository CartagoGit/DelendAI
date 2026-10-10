/**
 * inlined-packages.spec.ts — a published package carries the private
 * packages it uses, and says which public ones that obliges it to declare.
 */
import { describe, expect, it } from 'vitest';

import {
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
