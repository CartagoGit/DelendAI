/**
 * work-swarm.service.spec.ts — what the swarm can see about itself,
 * against a real repository with two agents at work.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';

import {
	identityOf,
	listWorkRefs,
	overlapsOf,
	readSwarm,
} from './work-swarm.service';

const roots: string[] = [];
const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { namespacePrefix: 'delendai' },
	},
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

/** A repository where two agents each hold a unit of work. */
const swarmRepo = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'swarm-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'swarm@example.com');
	git(root, 'config', 'user.name', 'Swarm');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(join(root, 'shared.ts'), 'export const shared = 0;\n');
	writeFileSync(join(root, 'alone.ts'), 'export const alone = 0;\n');
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');

	const unit = (ref: string, files: Record<string, string>): void => {
		const base = git(root, 'rev-parse', 'HEAD');
		git(root, 'checkout', '-q', '-b', 'tmp', base);
		for (const [name, body] of Object.entries(files)) {
			writeFileSync(join(root, name), body);
		}
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', `feat: ${ref}`);
		git(root, 'update-ref', `refs/heads/${ref}`, 'HEAD');
		git(root, 'checkout', '-q', 'develop');
		git(root, 'branch', '-q', '-D', 'tmp');
	};
	unit('delendai/wip/claude-opus-5/x1-S1-g1-topic', {
		'shared.ts': 'export const shared = 1;\n',
	});
	unit('delendai/wip/codex/x2-S1-g1-other', {
		'shared.ts': 'export const shared = 2;\n',
		'alone.ts': 'export const alone = 2;\n',
	});
	return root;
};

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

describe('reading the swarm from git (x00555)', () => {
	it('lists every unit of work, with the identity its ref carries', () => {
		const view = readSwarm({ root: swarmRepo(), policy });
		expect(view.integration).toBe('develop');
		expect(view.units.map((unit) => unit.agent).sort()).toEqual([
			'claude-opus-5',
			'codex',
		]);
		expect(view.units.map((unit) => unit.subject).sort()).toEqual([
			'x1-S1-g1-topic',
			'x2-S1-g1-other',
		]);
	});

	it('says how far each unit is from the integration branch, both ways', () => {
		const view = readSwarm({ root: swarmRepo(), policy });
		for (const unit of view.units) {
			expect(unit.ahead).toBe(1);
			expect(unit.behind).toBe(0);
		}
	});

	it('names the file two agents are both changing, before either lands', () => {
		const view = readSwarm({ root: swarmRepo(), policy });
		expect(view.overlaps).toHaveLength(1);
		expect(view.overlaps[0]?.path).toBe('shared.ts');
		expect(view.overlaps[0]?.refs).toHaveLength(2);
		// The file only one of them touches is not an overlap.
		expect(
			view.overlaps.some((overlap) => overlap.path === 'alone.ts'),
		).toBe(false);
	});

	it('reads the identity out of a ref name', () => {
		expect(identityOf('delendai/wip/codex/x2-S1-g1-other', policy)).toEqual(
			{ agent: 'codex', subject: 'x2-S1-g1-other' },
		);
	});

	it('counts a ref that exists locally and on a remote once', () => {
		const root = swarmRepo();
		const ref = 'delendai/wip/codex/x2-S1-g1-other';
		git(root, 'update-ref', `refs/remotes/origin/${ref}`, ref);
		const refs = listWorkRefs(root, policy);
		expect([...refs.keys()].filter((name) => name === ref)).toHaveLength(1);
	});

	it('sees a unit of work that exists only on a remote', () => {
		const root = swarmRepo();
		const ref = 'delendai/wip/gemini/x3-S1-g1-remote-only';
		git(
			root,
			'update-ref',
			`refs/remotes/origin/${ref}`,
			'delendai/wip/codex/x2-S1-g1-other',
		);
		expect(
			readSwarm({ root, policy }).units.map((unit) => unit.agent),
		).toContain('gemini');
	});

	it('answers an empty swarm without inventing one', () => {
		const root = mkdtempSync(join(tmpdir(), 'swarm-empty-'));
		roots.push(root);
		git(root, 'init', '-q', '-b', 'develop');
		git(root, 'config', 'user.email', 'a@b.c');
		git(root, 'config', 'user.name', 'A');
		git(root, 'config', 'commit.gpgsign', 'false');
		writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
		git(root, 'add', '-A');
		git(root, 'commit', '-q', '-m', 'base');
		const view = readSwarm({ root, policy });
		expect(view.units).toEqual([]);
		expect(view.overlaps).toEqual([]);
	});

	it('reports no overlap when nobody shares a path', () => {
		expect(
			overlapsOf([
				{
					ref: 'a',
					agent: 'a',
					subject: 's',
					tip: '1',
					ahead: 1,
					behind: 0,
					paths: ['one.ts'],
				},
				{
					ref: 'b',
					agent: 'b',
					subject: 's',
					tip: '2',
					ahead: 1,
					behind: 0,
					paths: ['two.ts'],
				},
			]),
		).toEqual([]);
	});
});
