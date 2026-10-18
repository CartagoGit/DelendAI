/**
 * personal-layer.service.spec.ts — a person's accounts for a project live
 * outside the repository and replace the shared ones with the same id.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	normalizeRemoteUrl,
	parsePersonalLayer,
	personalLayerPath,
	projectIdentity,
	withPersonalLayer,
} from '../../../../src/lib/plugins/personal-layer.service';

const dirs: string[] = [];
afterEach(() => {
	for (const dir of dirs.splice(0))
		rmSync(dir, { recursive: true, force: true });
});
const repo = (remote?: string): string => {
	const root = mkdtempSync(join(tmpdir(), 'personal-layer-'));
	dirs.push(root);
	execFileSync('git', ['init', '-q', root]);
	if (remote !== undefined) {
		execFileSync('git', ['-C', root, 'remote', 'add', 'origin', remote]);
	}
	return root;
};

const account = (accountId: string, extra: Record<string, unknown> = {}) => ({
	accountId,
	vendor: 'anthropic',
	credentialMode: 'official-subscription-login' as const,
	billingMode: 'subscription-included' as const,
	quotaGroups: [],
	permittedAutomation: false,
	...extra,
});

describe('the project a personal file belongs to', () => {
	it('reads an SSH and an HTTPS clone of one repository as one project', () => {
		expect(normalizeRemoteUrl('git@github.com:Acme/Tool.git')).toBe(
			'github.com/Acme/Tool',
		);
		expect(normalizeRemoteUrl('https://user@GitHub.com/Acme/Tool/')).toBe(
			'github.com/Acme/Tool',
		);
		expect(normalizeRemoteUrl('/srv/mirror/tool')).toBe('/srv/mirror/tool');
	});

	it('names two clones of one repository alike, and a repository with no remote by its path', async () => {
		const a = repo('git@github.com:acme/tool.git');
		const b = repo('https://github.com/acme/tool');
		const lonely = repo();
		expect(await projectIdentity(a)).toBe(await projectIdentity(b));
		expect(await projectIdentity(a)).toBe('remote:github.com/acme/tool');
		expect(await projectIdentity(lonely)).toMatch(/^path:/u);
		expect(personalLayerPath(await projectIdentity(a), '/cfg')).toBe(
			personalLayerPath(await projectIdentity(b), '/cfg'),
		);
		expect(personalLayerPath(await projectIdentity(a), '/cfg')).toMatch(
			/^\/cfg\/delendai\/projects\/[0-9a-f]{16}\.json$/u,
		);
		expect(
			personalLayerPath(await projectIdentity(lonely), '/cfg'),
		).not.toBe(personalLayerPath(await projectIdentity(a), '/cfg'));
	});
});

describe('a personal file read', () => {
	it('is an empty layer when missing, and says why when it cannot be taken', () => {
		expect(parsePersonalLayer(undefined)).toEqual({ layer: {} });
		expect(parsePersonalLayer('{ nope').issue).toMatch(/does not parse/u);
		expect(
			parsePersonalLayer(JSON.stringify({ secrets: 'x' })).issue,
		).toBeDefined();
		expect(
			parsePersonalLayer(JSON.stringify({ accounts: [account('mine')] }))
				.layer.accounts?.[0]?.accountId,
		).toBe('mine');
	});
});

describe('the personal layer over the shared configuration', () => {
	it('keeps shared accounts, adds personal ones, and replaces one id whole', () => {
		const { config, layers } = withPersonalLayer(
			{
				accounts: [
					account('team', { profileDir: 'profiles/team' }),
					account('kept'),
				],
				providers: [
					{
						id: 'opus',
						kind: 'cli',
						invoke: { kind: 'cli', command: 'claude' },
						modelId: 'claude-opus',
						contextWindow: 1,
						costTier: 1,
						strengths: [],
						weaknesses: [],
						accountId: 'team',
					},
				],
			},
			{
				accounts: [
					account('team', {
						credentialMode: 'byok-api-key',
						billingMode: 'pay-as-you-go',
						credentialEnv: 'MY_KEY',
					}),
					account('mine'),
				],
				providers: [{ id: 'opus', accountId: 'mine' }],
			},
		);
		expect(Object.fromEntries(layers)).toEqual({
			team: 'personal',
			kept: 'shared',
			mine: 'personal',
		});
		const team = config.accounts?.find((each) => each.accountId === 'team');
		expect(team).toMatchObject({
			credentialMode: 'byok-api-key',
			credentialEnv: 'MY_KEY',
		});
		expect(team).not.toHaveProperty('profileDir');
		expect(config.providers?.[0]?.accountId).toBe('mine');
	});

	it('leaves a configuration with no accounts as it was', () => {
		expect(withPersonalLayer({ namespacePrefix: 'x' }, {}).config).toEqual({
			namespacePrefix: 'x',
		});
	});
});
