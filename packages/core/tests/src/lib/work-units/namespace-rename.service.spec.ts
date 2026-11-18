/**
 * namespace-rename.service.spec.ts — the explicit rename moves a ref to the
 * current prefix at the same tip, and never one with an open pull request.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { INamespaceRenamePorts } from '@delendai/core/lib/contracts/interfaces/namespace-rename.interface';
import { renameNamespace } from '@delendai/core/lib/work-units/namespace-rename.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: {
			namespacePrefix: '',
			formerNamespacePrefixes: ['delendai'],
		},
	},
});

const fake = (
	initial: Record<string, string>,
	open: readonly string[] | undefined,
) => {
	const remote = new Map(Object.entries(initial));
	const kept: Record<string, string> = {};
	const ports: INamespaceRenamePorts = {
		heads: (prefixes) =>
			[...remote].flatMap(([name, sha]) =>
				prefixes.some((prefix) => name.startsWith(prefix))
					? [{ name, sha }]
					: [],
			),
		tipOf: (name) => remote.get(name),
		openPullRequestHeads: () => open,
		push: (name, sha) => remote.set(name, sha) !== undefined,
		verify: (name, sha) => remote.get(name) === sha,
		keep: (ref, sha) => {
			kept[ref] = sha;
			return true;
		},
		remove: (name) => remote.delete(name),
	};
	return { remote, kept, ports };
};

const OLD = 'delendai/wip/a/implement/x1-S1-g1/work';
const OLD_PR = 'delendai/pr/a/implement/x1-S1-g1/ship';

describe('renameNamespace', () => {
	it('[<50ms] is a dry run unless applied', () => {
		const { remote, ports } = fake({ [OLD]: 'aaa' }, []);
		const report = renameNamespace({ policy, ports, apply: false });
		expect(report.refs).toEqual([
			{
				from: OLD,
				to: 'wip/a/implement/x1-S1-g1/work',
				outcome: 'would-rename',
			},
		]);
		expect([...remote.keys()]).toEqual([OLD]);
	});

	it('[<50ms] renames work and publication refs at the same tip and keeps the old tip', () => {
		const { remote, kept, ports } = fake(
			{ [OLD]: 'aaa', [OLD_PR]: 'bbb' },
			[],
		);
		const report = renameNamespace({ policy, ports, apply: true });
		expect(report.refs.map((ref) => ref.outcome)).toEqual([
			'renamed',
			'renamed',
		]);
		expect(Object.fromEntries(remote)).toEqual({
			'wip/a/implement/x1-S1-g1/work': 'aaa',
			'pr/a/implement/x1-S1-g1/ship': 'bbb',
		});
		expect(kept[`refs/retired/${OLD}`]).toBe('aaa');
		expect(report.message).toContain('formerNamespacePrefixes');
	});

	it('[<50ms] refuses as a whole while an open pull request has its head under a former prefix', () => {
		const { remote, ports } = fake({ [OLD]: 'aaa' }, [OLD_PR]);
		const report = renameNamespace({ policy, ports, apply: true });
		expect(report.refused).toContain('open pull requests');
		expect([...remote.keys()]).toEqual([OLD]);
	});

	it('[<50ms] refuses when the forge cannot be read', () => {
		const { remote, ports } = fake({ [OLD]: 'aaa' }, undefined);
		const report = renameNamespace({ policy, ports, apply: true });
		expect(report.refused).toContain('forge cannot be read');
		expect([...remote.keys()]).toEqual([OLD]);
	});

	it('[<50ms] checks each ref again just before acting and leaves a ref whose tip moved', () => {
		const { remote, ports } = fake({ [OLD]: 'aaa' }, []);
		const moving: INamespaceRenamePorts = {
			...ports,
			tipOf: () => 'zzz',
		};
		const report = renameNamespace({ policy, ports: moving, apply: true });
		expect(report.refs[0]?.outcome).toBe('skipped-changed');
		expect(remote.get(OLD)).toBe('aaa');
	});

	it('[<50ms] never renames a ref that gained an open pull request after the listing', () => {
		const { remote, ports } = fake({ [OLD]: 'aaa' }, []);
		let reads = 0;
		const racing: INamespaceRenamePorts = {
			...ports,
			openPullRequestHeads: () => (reads++ === 0 ? [] : [OLD]),
		};
		const report = renameNamespace({ policy, ports: racing, apply: true });
		expect(report.refs[0]?.outcome).toBe('skipped-open-pull-request');
		expect(remote.get(OLD)).toBe('aaa');
	});

	it('[<50ms] says so and names the config line when nothing is left', () => {
		const { ports } = fake({ 'wip/a/x': 'aaa' }, []);
		const report = renameNamespace({ policy, ports, apply: true });
		expect(report.refs).toEqual([]);
		expect(report.message).toContain('No ref is left');
		expect(report.message).toContain('formerNamespacePrefixes');
	});
});
