import { describe, expect, it, vi } from 'vitest';

import { safeSendLoggingMessage } from '@delendai/notification/lib/services/safe-logging';

describe('safeSendLoggingMessage', () => {
	it('no-ops when sendLoggingMessage is missing', () => {
		expect(() =>
			safeSendLoggingMessage({} as never, {
				level: 'info',
				logger: 't',
				data: { ok: true },
			}),
		).not.toThrow();
	});

	it('invokes sendLoggingMessage when present', async () => {
		const send = vi.fn(async () => undefined);
		safeSendLoggingMessage({ sendLoggingMessage: send } as never, {
			level: 'info',
			logger: 't',
			data: { ok: 1 },
		});
		expect(send).toHaveBeenCalledOnce();
		await Promise.resolve();
	});

	it('swallows rejected promises', async () => {
		const send = vi.fn(async () => {
			throw new Error('boom');
		});
		expect(() =>
			safeSendLoggingMessage({ sendLoggingMessage: send } as never, {
				level: 'warning',
				logger: 't',
				data: {},
			}),
		).not.toThrow();
		await Promise.resolve();
	});
});
