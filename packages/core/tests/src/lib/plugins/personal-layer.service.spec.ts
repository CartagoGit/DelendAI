/**
 * personal-layer.service.spec.ts — a remote's port is part of its
 * identity, an older portless file moves to its new name once, and a
 * login left in the committed file is never used for everyone.
 */
import { execFileSync } from 'node:child_process';
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { fakePartial } from '@delendai/test-kit';
import { afterEach, describe, expect, it } from 'vitest';

import {
	normalizeRemoteUrl,
	personalLayerPath,
	portlessIdentity,
	projectIdentity,
	withPersonalLayer,
} from '../../../../src/lib/plugins/personal-layer.service';
import { createPersonalLayerPortMigrator } from '../../../../src/lib/workspace-migration/migrators/personal-layer-port.migrator';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
const temp = (): string => {
	const dir = mkdtempSync(join(tmpdir(), 'personal-layer-'));
	dirs.push(dir);
	return dir;
};

describe('a remote identity', () => {
	it('keeps an explicit port, so two servers on one host are two projects', () => {
		expect(
			normalizeRemoteUrl('https://git.example:8443/team/repo.git'),
		).toBe('git.example:8443/team/repo');
		expect(normalizeRemoteUrl('https://git.example/team/repo')).toBe(
			'git.example/team/repo',
		);
		expect(portlessIdentity('remote:git.example:8443/team/repo')).toBe(
			'remote:git.example/team/repo',
		);
		expect(
			portlessIdentity('remote:git.example/team/repo'),
		).toBeUndefined();
	});
});

describe('the port migration', () => {
	it('moves a file keyed without the port to its new name, once', async () => {
		const workspace = temp();
		const root = temp();
		execFileSync('git', ['init', '-q'], { cwd: workspace });
		execFileSync(
			'git',
			[
				'remote',
				'add',
				'origin',
				'https://git.example:8443/team/repo.git',
			],
			{ cwd: workspace },
		);
		const identity = await projectIdentity(workspace);
		const from = personalLayerPath(portlessIdentity(identity) ?? '', root);
		const to = personalLayerPath(identity, root);
		mkdirSync(dirname(from), { recursive: true });
		writeFileSync(from, '{"accounts":[]}');

		const migrator = createPersonalLayerPortMigrator(root);
		const ctx = fakePartial<Parameters<typeof migrator.detect>[0]>({
			workspaceRoot: workspace,
		});
		expect(await migrator.detect(ctx)).toBe(true);
		await migrator.apply(ctx);
		expect(existsSync(to)).toBe(true);
		expect(existsSync(from)).toBe(false);
		expect(await migrator.detect(ctx)).toBe(false);
	});
});

describe('withPersonalLayer', () => {
	it('never uses a login left in the committed file', () => {
		const { config } = withPersonalLayer(
			{
				accounts: [
					{
						accountId: 'team',
						vendor: 'anthropic',
						credentialMode: 'byok-api-key',
						billingMode: 'metered',
						quotaGroups: [],
						permittedAutomation: true,
					},
					{
						accountId: 'mine',
						vendor: 'anthropic',
						credentialMode: 'official-subscription-login',
						billingMode: 'subscription-included',
						profileDir: '/profiles/claude-work',
						quotaGroups: [],
						permittedAutomation: true,
					},
				],
			} as Parameters<typeof withPersonalLayer>[0],
			{},
		);
		expect(config.accounts?.map((account) => account.accountId)).toEqual([
			'team',
		]);
	});
});
