/**
 * plugin-tool-name.helper.spec.ts — a plugin's tool is named from one
 * rule: its configured prefix, or its id, under the core prefix.
 */
import { describe, expect, it } from 'vitest';

import {
	pluginNamespaceFor,
	pluginToolName,
} from '../../../../src/lib/plugins/plugin-tool-name.helper';

describe('the registered name of a plugin tool', () => {
	it("uses the plugin's id when the project configures no prefix", () => {
		const namespace = pluginNamespaceFor({}, 'logs');
		expect(namespace).toBe('logs');
		expect(pluginToolName('delendai', namespace, 'query')).toBe(
			'delendai_logs_query',
		);
	});

	it('uses the prefix the project configures for the plugin', () => {
		const namespace = pluginNamespaceFor(
			{ plugins: { notification: { prefix: 'notify' } } },
			'notification',
		);
		expect(pluginToolName('acme', namespace, 'await_lock')).toBe(
			'acme_notify_await_lock',
		);
	});
});
