/**
 * webview-message-schemas.spec.ts — a webview's message is checked before
 * any handler reads it.
 */
import { describe, expect, it } from 'vitest';

import {
	KNOWLEDGE_MESSAGE_SCHEMA,
	SETTINGS_MESSAGE_SCHEMA,
	TOOLBAR_MESSAGE_SCHEMA,
} from '../contracts/constants/webview-message-schemas.constant';

describe('webview messages', () => {
	it('takes what each webview sends', () => {
		expect(
			KNOWLEDGE_MESSAGE_SCHEMA.safeParse({
				command: 'openEntry',
				id: 'a',
			}).success,
		).toBe(true);
		expect(
			SETTINGS_MESSAGE_SCHEMA.safeParse({
				requestId: 'r',
				command: 'save',
				settings: {},
			}).success,
		).toBe(true);
		expect(
			TOOLBAR_MESSAGE_SCHEMA.safeParse({
				command: 'delendaiAction',
				commandId: 'x',
			}).success,
		).toBe(true);
		expect(
			TOOLBAR_MESSAGE_SCHEMA.safeParse({
				command: 'setLanguage',
				lang: 'es',
			}).success,
		).toBe(true);
	});

	it('refuses a malformed post', () => {
		for (const raw of [null, 'x', {}, { command: 'openEntry', id: '' }]) {
			expect(KNOWLEDGE_MESSAGE_SCHEMA.safeParse(raw).success).toBe(false);
		}
		expect(
			SETTINGS_MESSAGE_SCHEMA.safeParse({ command: 'save' }).success,
		).toBe(false);
		for (const raw of [
			{ command: 'other' },
			{ command: 'setLanguage', lang: 4 },
		]) {
			expect(TOOLBAR_MESSAGE_SCHEMA.safeParse(raw).success).toBe(false);
		}
	});
});
