import { describe, expect, it } from 'vitest';
import { resolveTaskPin } from '../../../../src/lib/prefs/resolve-task-pin';

describe('resolveTaskPin', () => {
	it('uses the explicit user choice before a configured task pin', () => {
		expect(
			resolveTaskPin('claude-cli', 'review', { review: 'groq-api' }),
		).toBe('claude-cli');
	});
	it('uses the matching configured task pin only when explicit is absent', () => {
		expect(
			resolveTaskPin(undefined, 'review', { review: 'groq-api' }),
		).toBe('groq-api');
	});
});
