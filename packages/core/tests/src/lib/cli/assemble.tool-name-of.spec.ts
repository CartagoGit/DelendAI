/**
 * assemble.tool-name-of.spec.ts — a plugin names another plugin's tool
 * the way the server registers it.
 *
 * A plugin knows its own namespace but not the core prefix or a peer's
 * configured prefix; the context answers for both, from the same rule
 * the assembly names every tool by.
 */
import { afterAll, describe, expect, it } from 'vitest';

import { assembleCliConfig } from '@delendai/core/lib/cli/assemble';
import { parseCliArgs } from '@delendai/core/lib/plugins/parse-cli-args';

import { createTestWorkspace, removeTestWorkspace } from '../test-workspace';

const WORKSPACE = createTestWorkspace('delendai-tool-name-of-');
afterAll(() => removeTestWorkspace(WORKSPACE));

let toolNameOf: ((plugin: string, toolId: string) => string) | undefined;
let namespacePrefix = '';

const plugin = {
	name: 'namer',
	register: (context: {
		namespacePrefix: string;
		toolNameOf?: (plugin: string, toolId: string) => string;
	}) => {
		namespacePrefix = context.namespacePrefix;
		toolNameOf = context.toolNameOf;
		return {};
	},
};

describe('the tool names a plugin context gives', () => {
	it("spell a peer's tool under its configured prefix and the core prefix", async () => {
		await assembleCliConfig(
			parseCliArgs(
				[
					'--plugins=namer',
					`--workspace=${WORKSPACE}`,
					'--surface=native',
				],
				WORKSPACE,
			),
			{
				readFile: async () =>
					JSON.stringify({
						plugins: {
							namer: {},
							notification: { prefix: 'notify' },
						},
					}),
				import: async () => ({ default: plugin }),
			},
		);
		expect(namespacePrefix).toMatch(/_namer$/u);
		const core = namespacePrefix.replace(/_namer$/u, '');
		expect(toolNameOf?.('notification', 'await_lock')).toBe(
			`${core}_notify_await_lock`,
		);
		expect(toolNameOf?.('logs', 'query')).toBe(`${core}_logs_query`);
		expect(toolNameOf?.('namer', 'run')).toBe(`${namespacePrefix}_run`);
	});
});
