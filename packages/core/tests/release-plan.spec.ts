import { describe, expect, it } from 'vitest';

// The release tooling lives at the repo root (scripts/), not inside a package.
// It is imported relatively so its pure planning logic is unit-tested and
// typechecked alongside the rest of the monorepo.
import {
	PUBLISH_ORDER,
	computeReleasePlan,
	nextVersion,
	type IReleasePkg,
} from '../../../tools/scripts/release/release-plan';

describe('nextVersion (N23 release tooling)', () => {
	it('bumps patch/minor/major and resets lower components', () => {
		expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1');
		expect(nextVersion('0.1.4', 'minor')).toBe('0.2.0');
		expect(nextVersion('0.9.3', 'major')).toBe('1.0.0');
	});

	it('tolerates surrounding whitespace', () => {
		expect(nextVersion('  1.2.3  ', 'patch')).toBe('1.2.4');
	});

	it('throws on a non-plain version', () => {
		expect(() => nextVersion('0.1.0-rc.1', 'patch')).toThrow(
			/plain X\.Y\.Z/,
		);
		expect(() => nextVersion('v1', 'patch')).toThrow();
	});
});

describe('computeReleasePlan (lockstep + peer rewrite)', () => {
	const pkgs: IReleasePkg[] = [
		{ dir: 'packages/core', name: '@mcp-vertex/core', version: '0.1.0' },
		{
			dir: 'plugins/git',
			name: '@mcp-vertex/git',
			version: '0.1.0',
			peerCoreRange: '^0.1.0',
		},
	];

	it('moves every package to one version derived from the core anchor', () => {
		const plan = computeReleasePlan(pkgs, { kind: 'minor' });
		expect(plan.to).toBe('0.2.0');
		expect(plan.entries.map((e) => e.to)).toEqual(['0.2.0', '0.2.0']);
	});

	it('rewrites the core peerDependency to ^<target> only where present', () => {
		const plan = computeReleasePlan(pkgs, { kind: 'minor' });
		const core = plan.entries[0];
		const git = plan.entries[1];
		expect(core?.peerCoreTo).toBeUndefined(); // core has no self-peer
		expect(git?.peerCoreFrom).toBe('^0.1.0');
		expect(git?.peerCoreTo).toBe('^0.2.0');
	});

	it('honours an explicit --set version', () => {
		const plan = computeReleasePlan(pkgs, { set: '1.4.2' });
		expect(plan.to).toBe('1.4.2');
		expect(plan.entries[1]?.peerCoreTo).toBe('^1.4.2');
	});

	it('rejects a malformed --set', () => {
		expect(() => computeReleasePlan(pkgs, { set: 'nope' })).toThrow(
			/X\.Y\.Z/,
		);
	});

	it('throws when there are no packages', () => {
		expect(() => computeReleasePlan([], { kind: 'patch' })).toThrow(
			/no packages/,
		);
	});
});

describe('PUBLISH_ORDER', () => {
	it('publishes the core first, then the nine plugins', () => {
		expect(PUBLISH_ORDER[0]).toBe('packages/core');
		expect(PUBLISH_ORDER).toHaveLength(10);
		expect(new Set(PUBLISH_ORDER).size).toBe(10);
	});
});
