/**
 * personal-accounts.migrator.spec.ts — one person's accounts leave the
 * committed configuration for their own file, once.
 */
import { execFileSync } from 'node:child_process';
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createPersonalAccountsMigrator } from '../../../../../src/lib/workspace-migration/migrators/personal-accounts.migrator';
import {
	personalLayerPath,
	projectIdentity,
} from '../../../../../src/lib/plugins/personal-layer.service';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
const temp = (prefix: string): string => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	dirs.push(dir);
	return dir;
};

const account = (accountId: string, extra: Record<string, unknown> = {}) => ({
	accountId,
	vendor: 'anthropic',
	credentialMode: 'official-subscription-login',
	billingMode: 'subscription-included',
	...extra,
});

const setUp = () => {
	const workspaceRoot = temp('personal-migrate-ws-');
	const personalRoot = temp('personal-migrate-cfg-');
	execFileSync('git', ['init', '-q', workspaceRoot]);
	writeFileSync(
		join(workspaceRoot, 'delendai.config.json'),
		`{\n\t// the team's accounts\n\t"accounts": ${JSON.stringify([
			account('team'),
			account('mine', { profileDir: 'profiles/mine' }),
			account('key', { credentialEnv: 'MY_KEY' }),
		])}\n}\n`,
	);
	const migrator = createPersonalAccountsMigrator(personalRoot);
	const ctx = { workspaceRoot, dryRun: false };
	const personalFile = personalLayerPath(
		projectIdentity(workspaceRoot),
		personalRoot,
	);
	const shared = () =>
		readFileSync(join(workspaceRoot, 'delendai.config.json'), 'utf8');
	return { migrator, ctx, personalFile, shared };
};

describe('personalAccountsMigrator', () => {
	it('moves the accounts that name a login, keeps the shared one and the comments', async () => {
		const { migrator, ctx, personalFile, shared } = setUp();
		expect(await migrator.detect(ctx)).toBe(true);
		expect((await migrator.plan(ctx)).map((step) => step.detail)).toEqual([
			expect.stringContaining('"mine"'),
			expect.stringContaining('"key"'),
		]);
		await migrator.apply(ctx);
		const moved = JSON.parse(readFileSync(personalFile, 'utf8')) as {
			accounts: { accountId: string }[];
		};
		expect(moved.accounts.map((each) => each.accountId)).toEqual([
			'mine',
			'key',
		]);
		expect(shared()).toContain('// the team');
		expect(shared()).toContain('"team"');
		expect(shared()).not.toContain('"mine"');
		expect(shared()).not.toContain('MY_KEY');
	});

	it('does nothing on a second run, and keeps what the person already declared', async () => {
		const { migrator, ctx, personalFile } = setUp();
		mkdirSync(dirname(personalFile), { recursive: true });
		writeFileSync(
			personalFile,
			JSON.stringify({
				accounts: [account('mine', { profileDir: 'mine-newer' })],
			}),
		);
		await migrator.apply(ctx);
		const after = readFileSync(personalFile, 'utf8');
		expect(after).toContain('mine-newer');
		expect(after).not.toContain('profiles/mine');
		expect(await migrator.detect(ctx)).toBe(false);
		await migrator.apply(ctx);
		expect(readFileSync(personalFile, 'utf8')).toBe(after);
	});

	it('refuses to write over a personal file it cannot read, and leaves the shared one', async () => {
		const { migrator, ctx, personalFile, shared } = setUp();
		const before = shared();
		mkdirSync(dirname(personalFile), { recursive: true });
		writeFileSync(personalFile, '{ nope');
		await expect(migrator.apply(ctx)).rejects.toThrow(/does not parse/u);
		expect(shared()).toBe(before);
	});
});
