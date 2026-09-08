import { describe, expect, it } from 'vitest';

import { InstallSuggestionsService } from '@delendai/core/lib/services/shell/install-suggestions';

describe('InstallSuggestionsService', () => {
	it('detects apt and suggests an install command', async () => {
		const service = new InstallSuggestionsService({
			workspaceRoot: '/workspace',
			run: async () => ({ code: 0, output: 'apt' }),
		});

		const suggestion = await service.suggest({
			entry: {
				name: 'jq',
				purpose: 'JSON processing',
				versionArgs: ['--version'],
				alternatives: ['python3'],
			},
			alternativesAvailable: [],
		});

		expect(suggestion).toEqual({
			manager: 'apt',
			command: 'sudo apt install jq',
			confirmed: false,
		});
	});

	it('prefers an already available alternative', async () => {
		const service = new InstallSuggestionsService({
			workspaceRoot: '/workspace',
			run: async () => ({ code: 0, output: 'apt' }),
		});

		const suggestion = await service.suggest({
			entry: {
				name: 'jq',
				purpose: 'JSON processing',
				versionArgs: ['--version'],
				alternatives: ['python3'],
			},
			alternativesAvailable: ['python3'],
		});

		expect(suggestion?.manager).toBe('none');
		expect(suggestion?.reason).toContain('python3');
	});

	it('returns null when no package manager is detected', async () => {
		const service = new InstallSuggestionsService({
			workspaceRoot: '/workspace',
			run: async () => ({ code: 0, output: '' }),
		});

		const suggestion = await service.suggest({
			entry: {
				name: 'jq',
				purpose: 'JSON processing',
				versionArgs: ['--version'],
				alternatives: ['python3'],
			},
			alternativesAvailable: [],
		});

		expect(suggestion).toBeNull();
	});

	it('detectManager returns none when no candidate is on PATH', async () => {
		const service = new InstallSuggestionsService({
			workspaceRoot: '/workspace',
			run: async () => ({ code: 0, output: '' }),
		});

		await expect(service.detectManager()).resolves.toBe('none');
	});

	it('detects brew when apt is missing', async () => {
		const service = new InstallSuggestionsService({
			workspaceRoot: '/workspace',
			run: async () => ({ code: 0, output: 'brew' }),
		});

		const suggestion = await service.suggest({
			entry: {
				name: 'jq',
				purpose: 'JSON processing',
				versionArgs: ['--version'],
				alternatives: [],
			},
			alternativesAvailable: [],
		});

		expect(suggestion).toEqual({
			manager: 'brew',
			command: 'brew install jq',
			confirmed: false,
		});
	});
});
