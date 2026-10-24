import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

// The release tooling lives at the repo root (scripts/), not inside a package.
// It is imported relatively so its pure planning logic is unit-tested and
// typechecked alongside the rest of the monorepo.
import {
	BUNDLED_PRIVATE_PACKAGES,
	PUBLISH_ORDER,
	computeReleasePlan,
	nextVersion,
	type IReleasePkg,
	withLockstepRanges,
	withSourceVersion,
	withWorkspaceLock,
} from '../../../tools/scripts/release/release-plan';

describe('nextVersion (N23 release tooling)', async () => {
	it('bumps patch/minor/major and resets lower components', async () => {
		expect(nextVersion('0.1.0', 'patch')).toBe('0.1.1');
		expect(nextVersion('0.1.4', 'minor')).toBe('0.2.0');
		expect(nextVersion('0.9.3', 'major')).toBe('1.0.0');
	});

	it('tolerates surrounding whitespace', async () => {
		expect(nextVersion('  1.2.3  ', 'patch')).toBe('1.2.4');
	});

	it('throws on a non-plain version', async () => {
		expect(() => nextVersion('0.1.0-rc.1', 'patch')).toThrow(
			/plain X\.Y\.Z/,
		);
		expect(() => nextVersion('v1', 'patch')).toThrow();
	});
});

describe('computeReleasePlan (lockstep + peer rewrite)', async () => {
	const pkgs: IReleasePkg[] = [
		{ dir: 'packages/core', name: '@delendai/core', version: '0.1.0' },
		{
			dir: 'plugins/git',
			name: '@delendai/git',
			version: '0.1.0',
			peerCoreRange: '^0.1.0',
		},
	];

	it('moves every package to one version derived from the core anchor', async () => {
		const plan = computeReleasePlan(pkgs, { kind: 'minor' });
		expect(plan.to).toBe('0.2.0');
		expect(plan.entries.map((e) => e.to)).toEqual(['0.2.0', '0.2.0']);
	});

	it('rewrites the core peerDependency to ^<target> only where present', async () => {
		const plan = computeReleasePlan(pkgs, { kind: 'minor' });
		const core = plan.entries[0];
		const git = plan.entries[1];
		expect(core?.peerCoreTo).toBeUndefined(); // core has no self-peer
		expect(git?.peerCoreFrom).toBe('^0.1.0');
		expect(git?.peerCoreTo).toBe('^0.2.0');
	});

	it('honours an explicit --set version', async () => {
		const plan = computeReleasePlan(pkgs, { set: '1.4.2' });
		expect(plan.to).toBe('1.4.2');
		expect(plan.entries[1]?.peerCoreTo).toBe('^1.4.2');
	});

	it('rejects a malformed --set', async () => {
		expect(() => computeReleasePlan(pkgs, { set: 'nope' })).toThrow(
			/X\.Y\.Z/,
		);
	});

	it('throws when there are no packages', async () => {
		expect(() => computeReleasePlan([], { kind: 'patch' })).toThrow(
			/no packages/,
		);
	});
});

describe('PUBLISH_ORDER', async () => {
	const root = resolve(import.meta.dirname, '../../..');

	it('publishes core, client and the executable CLI in dependency order', () => {
		// `packages/contracts` is a leaf that `github`, `gitlab` and
		// `remote-provider-core` depend on, so it packs before everything.
		// `packages/state` follows it and precedes core: core constructs a
		// State Registry during startup, so it needs the implementation at
		// runtime (see ALLOWED_CORE_RUNTIME_DEPENDENCIES). That dependency
		// is why `state` stopped being private and joined the publish set.
		// Asserted as RELATIVE order rather than a fixed prefix: this
		// expectation has broken twice already simply because a package
		// became publishable (`state`, then `proposals-sqlite`), which is
		// the packaging work succeeding, not a regression. What must hold
		// is that each of these packs before the one that depends on it.
		const chain = [
			'packages/contracts',
			'packages/state',
			'packages/core',
			'packages/client',
			'packages/cli',
		];
		const positions = chain.map((dir) => PUBLISH_ORDER.indexOf(dir));
		expect(positions.every((index) => index >= 0)).toBe(true);
		expect(positions).toEqual([...positions].sort((a, b) => a - b));
		expect(new Set(PUBLISH_ORDER).size).toBe(PUBLISH_ORDER.length);
	});

	it('publishes every first-party plugin, covering every preset and documented plugin', async () => {
		const pluginDirs = (
			await readdir(resolve(root, 'plugins'), {
				withFileTypes: true,
			})
		)
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
		// Internal-only plugins (`"private": true`, e.g. issues-triage)
		// are intentionally absent from PUBLISH_ORDER — they never ship
		// to npm.
		const plugins: string[] = [];
		await Promise.all(
			pluginDirs.map(async (name) => {
				const manifest = JSON.parse(
					await readFile(
						resolve(root, 'plugins', name, 'package.json'),
						'utf8',
					),
				) as { private?: boolean };
				if (manifest.private !== true) plugins.push(`plugins/${name}`);
			}),
		);
		plugins.sort();
		expect(
			PUBLISH_ORDER.filter((dir) => dir.startsWith('plugins/')).sort(),
		).toEqual(plugins);
	});

	it('keeps VS Code source dependencies private because the extension bundles them', async () => {
		for (const dir of BUNDLED_PRIVATE_PACKAGES) {
			const manifest = JSON.parse(
				await readFile(resolve(root, dir, 'package.json'), 'utf8'),
			) as { private?: boolean };
			expect(manifest.private, dir).toBe(true);
			expect(PUBLISH_ORDER, dir).not.toContain(dir);
		}
		const build = await readFile(
			resolve(root, 'extensions/vscode/scripts/build.ts'),
			'utf8',
		);
		expect(build).toContain("external: ['vscode']");
	});
});

describe('withSourceVersion', () => {
	it('sets the top-level version line a manifest or entry states', () => {
		expect(
			withSourceVersion(
				"export default {\n\tid: 'x',\n\tversion: '0.1.1',\n};\n",
				'0.2.0',
			),
		).toBe("export default {\n\tid: 'x',\n\tversion: '0.2.0',\n};\n");
	});

	it('leaves a nested version and a file without one alone', () => {
		const nested = "const t = {\n\t\tversion: '9.9.9',\n};\n";
		expect(withSourceVersion(nested, '0.2.0')).toBe(nested);
		expect(withSourceVersion('export {};\n', '0.2.0')).toBe('export {};\n');
	});
});

describe('withLockstepRanges', () => {
	it('moves every lockstep range to the release, leaving workspace and outside ranges', () => {
		expect(
			withLockstepRanges(
				{
					name: '@delendai/prompt-eval',
					peerDependencies: {
						'@delendai/core': '^0.1.1',
						'@delendai/auto-agent-selector': '^0.1.0',
					},
					dependencies: {
						zod: '^4.4.3',
						'@delendai/contracts': 'workspace:*',
					},
					devDependencies: { '@delendai/core': 'workspace:*' },
				},
				new Set([
					'@delendai/core',
					'@delendai/auto-agent-selector',
					'@delendai/contracts',
				]),
				'0.2.0',
			),
		).toEqual({
			name: '@delendai/prompt-eval',
			peerDependencies: {
				'@delendai/core': '^0.2.0',
				'@delendai/auto-agent-selector': '^0.2.0',
			},
			dependencies: {
				zod: '^4.4.3',
				'@delendai/contracts': 'workspace:*',
			},
			devDependencies: { '@delendai/core': 'workspace:*' },
		});
	});
});

describe('withLockstepRanges on a private manifest', () => {
	it('moves a pinned dev dependency on a lockstep package too', () => {
		expect(
			withLockstepRanges(
				{
					private: true,
					devDependencies: {
						'@delendai/core': '0.1.1',
						vitest: '5.0.3',
					},
				},
				new Set(['@delendai/core']),
				'0.2.0',
			),
		).toEqual({
			private: true,
			devDependencies: { '@delendai/core': '^0.2.0', vitest: '5.0.3' },
		});
	});
});

describe('withWorkspaceLock', () => {
	it('restates each workspace version and inner range, and nothing else', () => {
		const lock = [
			'{',
			'  "workspaces": {',
			'    "plugins/a": {',
			'      "name": "@delendai/a",',
			'      "version": "0.1.1",',
			'      "dependencies": {',
			'        "@delendai/core": "^0.1.1",',
			'        "zod": "^4.4.3",',
			'      },',
			'    },',
			'  },',
			'  "packages": {',
			'    "zod": ["zod@4.5.4"],',
			'  },',
			'}',
		].join('\n');
		const after = withWorkspaceLock(lock, (dir) =>
			dir === 'plugins/a'
				? {
						version: '0.2.0',
						dependencies: {
							'@delendai/core': '^0.2.0',
							zod: '^4.4.3',
						},
					}
				: undefined,
		);
		expect(after).toBe(
			lock
				.replace('"version": "0.1.1"', '"version": "0.2.0"')
				.replace('"^0.1.1"', '"^0.2.0"'),
		);
	});
	it('takes each range from the section the lock line is in', () => {
		const lock = [
			'  "workspaces": {',
			'    "packages/client": {',
			'      "version": "0.2.0",',
			'      "devDependencies": {',
			'        "@delendai/core": "workspace:*",',
			'      },',
			'      "peerDependencies": {',
			'        "@delendai/core": "^0.2.0",',
			'      },',
			'    },',
			'  },',
		].join('\n');
		const after = withWorkspaceLock(lock, () => ({
			version: '0.2.1',
			devDependencies: { '@delendai/core': 'workspace:*' },
			peerDependencies: { '@delendai/core': '^0.2.1' },
		}));
		expect(after).toBe(
			lock
				.replace('"version": "0.2.0"', '"version": "0.2.1"')
				.replace('"^0.2.0"', '"^0.2.1"'),
		);
	});
});
