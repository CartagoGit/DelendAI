import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import { INTEGRATION_COMMAND } from '../contracts/constants/integration-command.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';

import { integrationCommand } from './integration.command';

const ctx = fakePartial<ICliCommandContext>({
	cwd: '/ws',
	globals: {
		workspace: '/ws',
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
});

describe('the integration command', () => {
	it('[<50ms] refuses a subcommand it does not have, with its usage', async () => {
		const result = await integrationCommand.run(['pause'], ctx);
		expect(result.code).toBe(EXIT_CODE.USAGE);
		expect(result.error).toContain('integration rehearse');
	});

	it('[<50ms] refuses a mode it does not run', async () => {
		const result = await integrationCommand.run(
			['rehearse', '--mode=real'],
			ctx,
		);
		expect(result.code).toBe(EXIT_CODE.USAGE);
	});

	it('[<50ms] declares the flags it reads and runs without a server', () => {
		expect(integrationCommand.flags).toEqual(INTEGRATION_COMMAND.flags);
		expect(integrationCommand.offline).toBe(true);
	});
});
