/**
 * work-unit-publish-proof.spec.ts — on the pull-request route a unit is
 * published only after the proof its integration branch declares passed,
 * and `work prove` runs that proof without publishing.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IWorkUnitContext } from '@delendai/core/lib/contracts/interfaces/work-unit-context.interface';
import { runWorkUnit } from '@delendai/core/lib/work-units/work-unit.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const git = (cwd: string, ...args: string[]): string =>
	execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

const repo = (prove: string | undefined): string => {
	const root = mkdtempSync(join(tmpdir(), 'publish-proof-'));
	roots.push(root);
	git(root, 'init', '-q', '-b', 'develop');
	git(root, 'config', 'user.email', 'work@example.com');
	git(root, 'config', 'user.name', 'Work');
	git(root, 'config', 'commit.gpgsign', 'false');
	writeFileSync(
		join(root, 'package.json'),
		JSON.stringify({
			name: 'probe',
			private: true,
			...(prove === undefined ? {} : { scripts: { prove } }),
		}),
	);
	writeFileSync(
		join(root, 'delendai.config.json'),
		JSON.stringify({
			development: {
				profile: 'shared-checkout-pr',
				branches: { namespacePrefix: 'delendai' },
			},
		}),
	);
	git(root, 'add', '-A');
	git(root, 'commit', '-q', '-m', 'base');
	return root;
};

const contextFor = (root: string): IWorkUnitContext =>
	fakePartial<IWorkUnitContext, 'cwd' | 'globals'>({
		cwd: root,
		globals: fakePartial<
			IWorkUnitContext['globals'],
			'workspace' | 'json' | 'remote'
		>({ workspace: root, json: true, remote: 'nowhere' }),
	});

const UNIT = [
	'--proposal=x00001',
	'--slice=S1',
	'--agent=claude-opus-5',
	'--topic=probe',
];

const checkpoint = async (root: string): Promise<void> => {
	writeFileSync(join(root, 'a.ts'), 'export const a = 1;\n');
	const done = await runWorkUnit(
		['checkpoint', ...UNIT, '--paths=a.ts', '--message=feat: a'],
		contextFor(root),
	);
	expect(done.code).toBe(0);
};

describe('publishing a pull request runs the declared proof', () => {
	it('publishes nothing when the proof fails, and names it', async () => {
		const root = repo('exit 3');
		await checkpoint(root);
		const published = await runWorkUnit(
			['publish', ...UNIT, '--no-pull-request'],
			contextFor(root),
		);
		expect(published.code).not.toBe(0);
		expect(published.error).toContain('its proof failed');
		expect(published.error).toContain('npm run prove failed');
		expect(published.error).toContain('work prove');
		expect(git(root, 'branch', '--list', 'delendai/pr/*')).toBe('');
	}, 60_000);

	it('proves with `work prove`, then publishes without proving again', async () => {
		const root = repo('exit 0');
		await checkpoint(root);
		const proved = await runWorkUnit(['prove', ...UNIT], contextFor(root));
		expect(proved.code).toBe(0);
		expect(proved.data).toMatchObject({ proved: true, remembered: false });
		const again = await runWorkUnit(['prove', ...UNIT], contextFor(root));
		expect(again.data).toMatchObject({ remembered: true });

		const published = await runWorkUnit(
			['publish', ...UNIT, '--no-pull-request'],
			contextFor(root),
		);
		// The remote does not exist: the push fails, after the proof passed.
		expect(published.error ?? '').not.toContain('proof failed');
		expect(published.data).toMatchObject({
			proof: { declared: true, remembered: true },
		});
	}, 60_000);

	it('tells a project that declares no proof how to declare one', async () => {
		const root = repo(undefined);
		await checkpoint(root);
		const proved = await runWorkUnit(['prove', ...UNIT], contextFor(root));
		expect(proved.code).toBe(0);
		expect(proved.data).toMatchObject({ proved: false });
		expect(JSON.stringify(proved.data)).toContain('`prove` script');
		const published = await runWorkUnit(
			['publish', ...UNIT, '--no-pull-request'],
			contextFor(root),
		);
		expect(JSON.stringify(published.data)).toContain('`prove` script');
	}, 60_000);

	it('says what it needs to prove', async () => {
		const root = repo('exit 0');
		const missing = await runWorkUnit(['prove'], contextFor(root));
		expect(missing.code).not.toBe(0);
		expect(missing.error).toContain('work prove --proposal=');
		const unknown = await runWorkUnit(['prove', ...UNIT], contextFor(root));
		expect(unknown.code).not.toBe(0);
		expect(unknown.error).toContain('resolves to no commit');
	});

	it('refuses a failing proof from `work prove` too', async () => {
		const root = repo('exit 3');
		await checkpoint(root);
		const proved = await runWorkUnit(['prove', ...UNIT], contextFor(root));
		expect(proved.code).not.toBe(0);
		expect(proved.error).toContain('was not proved');
	}, 60_000);
});
