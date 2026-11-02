import { describe, expect, it } from 'vitest';

import {
	REDACTED,
	safeProviderMessage,
} from '@delendai/core/lib/forge-governance/redact-secrets';

/** Assembled at run time so the literal is not a credential-shaped string in the source. */
const bearerHeader = (): string => `Bearer ${'a'.repeat(8)}${'B'.repeat(24)}`;

describe('safeProviderMessage', () => {
	it('trims the message', () => {
		expect(safeProviderMessage('  not found \n')).toBe('not found');
	});

	it('scrubs a credential quoted back by the provider', () => {
		const message = safeProviderMessage(`denied: ${bearerHeader()}`);
		expect(message).toContain(REDACTED);
		expect(message).not.toContain('BBBBBBBB');
	});

	it('caps an unbounded body and marks the cut', () => {
		const message = safeProviderMessage('x'.repeat(1000), 10);
		expect(message).toBe(`${'x'.repeat(10)}…`);
	});

	it('keeps a message that fits whole', () => {
		expect(safeProviderMessage('short', 400)).toBe('short');
	});

	it('caps at 400 characters unless told otherwise', () => {
		expect(safeProviderMessage('y'.repeat(500))).toHaveLength(401);
	});
});
