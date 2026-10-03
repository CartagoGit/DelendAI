/**
 * delendai-session.service.spec.ts — the session marker reaches children.
 */
import { describe, expect, it } from 'vitest';

import { markDelendaiSession } from './delendai-session.service';

describe('markDelendaiSession', () => {
	it('marks the environment its children inherit', () => {
		const env: NodeJS.ProcessEnv = {};
		markDelendaiSession(['work', 'enter'], env);
		expect(env.DELENDAI_SESSION).toBe('1');
	});

	it('marks a server too', () => {
		const env: NodeJS.ProcessEnv = {};
		markDelendaiSession(['__serve'], env);
		expect(env.DELENDAI_SESSION).toBe('1');
	});

	it('never marks the guard, which judges the process that called git', () => {
		const env: NodeJS.ProcessEnv = {};
		markDelendaiSession(['guard', 'pre-commit'], env);
		expect(env.DELENDAI_SESSION).toBe(undefined);
	});

	it('keeps a value a parent session already set', () => {
		const env: NodeJS.ProcessEnv = { DELENDAI_SESSION: 'parent' };
		markDelendaiSession(['status'], env);
		expect(env.DELENDAI_SESSION).toBe('parent');
	});
});
