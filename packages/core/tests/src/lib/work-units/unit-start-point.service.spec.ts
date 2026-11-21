/**
 * unit-start-point.service.spec.ts — a unit entered again while its pull
 * request is open continues from that pull request, not from develop.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import {
	createUnitRef,
	unitStartPoint,
} from '@delendai/core/lib/work-units/unit-start-point.service';

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});
const UNIT = 'agent/create/x1-all-g1/topic';
const BRANCH = `delendai/wip/${UNIT}`;
const PUBLICATION = `delendai/pr/${UNIT}`;

describe('unitStartPoint', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const git = (cwd: string, ...args: string[]): string =>
		execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
	const commit = (root: string, file: string): string => {
		writeFileSync(join(root, file), `${file}\n`);
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', file);
		return git(root, 'rev-parse', 'HEAD');
	};
	const clone = () => {
		const top = mkdtempSync(join(tmpdir(), 'unit-start-'));
		dirs.push(top);
		const remote = join(top, 'forge.git');
		git(top, 'init', '-q', '--bare', '-b', 'develop', remote);
		const root = join(top, 'clone');
		git(top, 'clone', '-q', remote, root);
		git(root, 'config', 'user.name', 'spec');
		git(root, 'config', 'user.email', 'spec@example.invalid');
		const base = commit(root, 'a.txt');
		git(root, 'push', '-q', 'origin', 'HEAD:develop');
		return { root, base };
	};
	const publish = (root: string, base: string): string => {
		git(root, 'checkout', '-q', '-b', 'work', base);
		const tip = commit(root, 'b.txt');
		git(root, 'push', '-q', 'origin', `HEAD:refs/heads/${PUBLICATION}`);
		git(root, 'checkout', '-q', 'develop');
		git(root, 'branch', '-q', '-D', 'work');
		return tip;
	};

	it('starts from the integration base when nothing is published', () => {
		const { root, base } = clone();
		expect(unitStartPoint({ root, policy, branch: BRANCH, base })).toBe(
			base,
		);
	});

	it('continues from a publication that has not landed', () => {
		const { root, base } = clone();
		const tip = publish(root, base);
		expect(
			createUnitRef({
				root,
				policy,
				ref: `refs/heads/${BRANCH}`,
				branch: BRANCH,
				base,
			}),
		).toBe(true);
		expect(git(root, 'rev-parse', `refs/heads/${BRANCH}`)).toBe(tip);
	});

	it('starts from the base once the publication has landed', () => {
		const { root, base } = clone();
		const tip = publish(root, base);
		git(root, 'fetch', '-q', 'origin', `refs/heads/${PUBLICATION}`);
		git(root, 'merge', '-q', '--ff-only', tip);
		const landed = commit(root, 'c.txt');
		expect(
			unitStartPoint({ root, policy, branch: BRANCH, base: landed }),
		).toBe(landed);
	});

	it('leaves a branch outside the unit namespaces on the base', () => {
		const { root, base } = clone();
		expect(
			unitStartPoint({ root, policy, branch: 'feature/x', base }),
		).toBe(base);
	});
});
