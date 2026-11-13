import { describe, expect, it } from 'vitest';
import { fakePartial } from '@delendai/test-kit';

import { EXIT_CODE } from '../contracts/constants/exit-code.constant';
import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { sessionHandoverCommand } from './session-handover.command';

const ctx = fakePartial<ICliCommandContext>({
	globals: fakePartial<ICliCommandContext['globals']>({ workspace: '/w' }),
});

describe('session handover', () => {
	it('[<20ms] refuses an unknown action with its usage', async () => {
		const got = await sessionHandoverCommand.run(['explode'], ctx);
		expect(got.code).toBe(EXIT_CODE.USAGE);
		expect(got.text).toContain('persist|index|show');
	});

	it('[<20ms] only persist writes', () => {
		expect(sessionHandoverCommand.readsOnly?.(['persist'])).toBe(false);
		expect(sessionHandoverCommand.readsOnly?.(['index'])).toBe(true);
	});
});
