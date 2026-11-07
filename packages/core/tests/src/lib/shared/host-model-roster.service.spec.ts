/**
 * host-model-roster.service.spec.ts — the BYOK providers of every editor
 * profile, by name, with not one byte of a credential in the result.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { HOST_BYOK_CACHE_VARIABLE } from '../../../../src/lib/contracts/constants/host-byok.constant';
import { HOST_USER_DIRS_VARIABLE } from '../../../../src/lib/contracts/constants/host-chat-model.constant';
import { classificationFromAnswer } from '../../../../src/lib/plugins/account-offers.service';
import { findingsFromHostByok } from '../../../../src/lib/shared/account-sources.service';
import {
	detectHostByok,
	hostByokRoster,
	hostProfileOf,
} from '../../../../src/lib/shared/host-model-roster.service';

// Assembled at run time: no credential-shaped literal is checked in.
const KEY = ['fixture', 'key', 'value', '0123456789'].join('-');

const userDir = (): string => {
	const dir = join(mkdtempSync(join(tmpdir(), 'host-byok-')), 'User');
	mkdirSync(join(dir, 'profiles', 'p1'), { recursive: true });
	mkdirSync(join(dir, 'globalStorage'), { recursive: true });
	writeFileSync(join(dir, 'chatLanguageModels.json'), '[]');
	writeFileSync(
		join(dir, 'profiles', 'p1', 'chatLanguageModels.json'),
		`// the editor writes JSON with comments
[
	{
		"name": "Coding Plan",
		"vendor": "customendpoint",
		"apiKey": "${KEY}",
		"models": [
			{
				"id": "glm-5.3",
				"name": "GLM 5.3",
				"url": "https://api.example.test/v4/chat/completionsDELENDAI_REDACTED_SECRET_QUERY_TOKEN
				"toolCalling": true,
				"vision": false,
				"contextWindow": 1000000,
				"maxOutputTokens": 64000,
				"requestHeaders": { "Authorization": "${KEY}" },
				"supportsReasoningEffort": ["low", "max"]
			},
			{ "name": "no id" }
		],
	},
	{ "name": "MiniMax", "vendor": "minimax", "apiKey": "${KEY}" },
	{ "name": "no vendor" }
]`,
	);
	writeFileSync(
		join(dir, 'globalStorage', 'storage.json'),
		JSON.stringify({
			userDataProfiles: [{ location: 'p1', name: 'Work' }],
			profileAssociations: {
				workspaces: {
					'vscode-remote://wsl%2Bubuntu/work/me':
						'__default__profile__',
					'vscode-remote://wsl%2Bubuntu/work/me/project': 'p1',
				},
			},
		}),
	);
	return dir;
};

describe('hostByokRoster', () => {
	it('lists each profile provider and its models by name, and nothing of a credential', async () => {
		const dir = userDir();
		const roster = await hostByokRoster({ [HOST_USER_DIRS_VARIABLE]: dir });
		expect(roster.map((each) => [each.profile, each.vendor])).toEqual([
			['p1', 'customendpoint'],
			['p1', 'minimax'],
		]);
		expect(roster[0]).toMatchObject({
			host: dir,
			profileName: 'Work',
			name: 'Coding Plan',
			models: [
				{
					id: 'glm-5.3',
					name: 'GLM 5.3',
					endpointHost: 'api.example.test',
					toolCalling: true,
					vision: false,
					contextWindow: 1000000,
					reasoningEfforts: ['low', 'max'],
				},
			],
		});
		const out = JSON.stringify(roster);
		expect(out).not.toContain(KEY);
		expect(out).not.toMatch(/apiKey|Authorization|maxOutputTokens/u);
	});

	it('is empty where no editor keeps a BYOK file', async () => {
		const empty = mkdtempSync(join(tmpdir(), 'host-byok-none-'));
		expect(
			await hostByokRoster({ [HOST_USER_DIRS_VARIABLE]: empty }),
		).toEqual([]);
	});
});

describe('hostProfileOf', () => {
	it('names the profile the deepest associated folder opens in', async () => {
		const dir = userDir();
		expect(await hostProfileOf(dir, '/work/me/project/sub')).toBe('p1');
		expect(await hostProfileOf(dir, '/work/me/other')).toBe('default');
		expect(await hostProfileOf(dir, '/elsewhere')).toBeUndefined();
	});
});

describe('a BYOK provider as an account', () => {
	it('is offered as a host-held account, however the person says it is paid', async () => {
		const dir = userDir();
		const [finding] = findingsFromHostByok(
			await hostByokRoster({ [HOST_USER_DIRS_VARIABLE]: dir }),
		);
		expect(finding).toMatchObject({
			source: 'host-byok',
			accountId: 'coding-plan-byok',
			hostHeld: true,
			models: ['glm-5.3'],
		});
		expect(JSON.stringify(finding)).not.toContain(KEY);
		if (finding === undefined) return;
		for (const billing of ['prepaid-token-plan', 'pay-as-you-go'] as const)
			expect(
				classificationFromAnswer(finding, 'Z.AI', billing)
					.credentialMode,
			).toBe('host-held');
	});
});

describe('detectHostByok', () => {
	it('keeps the detected roster in the user cache, and an empty one on a machine without editors', async () => {
		const cache = join(
			mkdtempSync(join(tmpdir(), 'host-byok-cache-')),
			'deep',
			'host-byok.json',
		);
		const dir = userDir();
		const found = await detectHostByok({
			env: {
				[HOST_USER_DIRS_VARIABLE]: dir,
				[HOST_BYOK_CACHE_VARIABLE]: cache,
			},
			now: new Date('2026-10-27T00:00:00.000Z'),
		});
		expect(found.providers).toHaveLength(2);
		const kept = JSON.parse(readFileSync(cache, 'utf8'));
		expect(kept).toEqual(found);
		expect(readFileSync(cache, 'utf8')).not.toContain(KEY);

		const none = await detectHostByok({
			env: {
				[HOST_USER_DIRS_VARIABLE]: mkdtempSync(
					join(tmpdir(), 'no-editor-'),
				),
				[HOST_BYOK_CACHE_VARIABLE]: cache,
			},
		});
		expect(none.providers).toEqual([]);
		expect(JSON.parse(readFileSync(cache, 'utf8')).providers).toEqual([]);
	});
});
