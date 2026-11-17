/**
 * work-swarm-shared-unlanded.spec.ts — the unlanded commits two units
 * share are read once per unit and intersected in memory (v00156).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type { ISwarmUnit } from '@delendai/core/lib/contracts/interfaces/work-swarm.interface';
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

describe('the unlanded commits two units share (v00156)', () => {
	it('[<20ms] asks git once per unit, never with two tips, whatever the pairs', () => {
		const asked: string[][] = [];
		const history: Record<string, string[]> = {
			t1: ['c1'],
			t2: ['c1', 'c2'],
			t3: ['c1', 'c2', 'c3'],
			t4: ['d1'],
			t5: ['e1'],
		};
		const shared = sharedUnlandedCounter((...tips) => {
			asked.push(tips);
			return history[tips[0] ?? ''] ?? [];
		});
		const units = Object.keys(history).map((tip) => swarmUnit(tip));
		for (const [index, left] of units.entries()) {
			for (const right of units.slice(index + 1)) shared(left, right);
		}
		expect(asked).toHaveLength(units.length);
		expect(asked.every((tips) => tips.length === 1)).toBe(true);
		const [t1, t2, t3, t4] = units;
		expect(shared(t1 as ISwarmUnit, t2 as ISwarmUnit)).toBe(1);
		expect(shared(t2 as ISwarmUnit, t3 as ISwarmUnit)).toBe(2);
		expect(shared(t3 as ISwarmUnit, t4 as ISwarmUnit)).toBe(0);
		expect(asked).toHaveLength(units.length);
	});

	it('[<5ms] does not ask git about a unit with no commits of its own', () => {
		const asked: string[] = [];
		const shared = sharedUnlandedCounter((tip) => {
			asked.push(tip);
			return ['c1'];
		});
		expect(shared(swarmUnit('t1', 0), swarmUnit('t2'))).toBe(0);
		expect(asked).toEqual(['t2']);
	});

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
