/**
 * work-swarm-shared-unlanded.e2e.spec.ts — the unlanded commits two units
 * share are read once per unit and intersected in memory (v00156).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	readSwarm,
	sharedUnlandedCounter,
} from '@delendai/core/lib/work-units/work-swarm.service';

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** Two units from develop, plus a third built on the first one's commit. */
const swarmRepo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'swarm-shared-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'swarm@example.com');
	git(root, 'config', 'user.name', 'Swarm');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'shared.ts'), 'export const shared = 0;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	const unit = (ref: string, from: string, file: string): void => {
		git(root, 'checkout', '-q', '-b', 'tmp', from);
		writeFileSync(join(root, file), `export const x = '${ref}';\n`);
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', `feat: ${ref}`);
		git(root, 'update-ref', `refs/heads/${ref}`, 'HEAD');
		git(root, 'checkout', '-q', 'develop');
		git(root, 'branch', '-q', '-D', 'tmp');
	};
	const first = 'delendai/wip/claude-opus-5/x1-S1-g1-topic';
	unit(first, 'develop', 'one.ts');
	unit('delendai/wip/codex/x2-S1-g1-other', 'develop', 'two.ts');
	unit('delendai/wip/gemini/x3-S1-g1-third', first, 'three.ts');
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const swarmUnit = (tip: string, ahead = 1): ISwarmUnit => ({
	ref: `ref-${tip}`,
	agent: 'a',
	subject: 's',
	tip,
	ahead,
	behind: 0,
	paths: [],
});

describe('the unlanded commits two units share, against a repository (v00156)', () => {
	it('[<2000ms] reports the same relations as the pair-by-pair merge-base did', () => {
		const root = swarmRepo();
		const view = readSwarm({ root, policy });
		const viaMergeBase = (left: string, right: string): number => {
			const base = git(root, 'merge-base', left, right);
			return Number(
				git(
					root,
					'rev-list',
					'--count',
					'--no-merges',
					`develop..${base}`,
				),
			);
		};
		const shared = sharedUnlandedCounter((tip) =>
			git(root, 'rev-list', '--no-merges', `develop..${tip}`)
				.split('\n')
				.filter((line) => line.length > 0),
		);
		let overlapping = 0;
		let disjoint = 0;
		for (const [index, left] of view.units.entries()) {
			for (const right of view.units.slice(index + 1)) {
				const expected = viaMergeBase(left.tip, right.tip);
				expect(shared(left, right)).toBe(expected);
				if (expected > 0) overlapping += 1;
				else disjoint += 1;
			}
		}
		expect(overlapping).toBe(1);
		expect(disjoint).toBe(2);
		expect(
			view.relations.filter((relation) => relation.kind === 'stacked'),
		).toHaveLength(1);
	});
});
