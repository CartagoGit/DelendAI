/**
 * namespace-prefix.spec.ts — f00081 S2.
 *
 * Verifies the VS Code host reads `delendai.server.prefix` from the
 * workspace configuration and threads it into the client services so a
 * `--prefix=acme` deployment calls `acme_*` tools instead of the default
 * `delendai_*` ones.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import { resolveNamespacePrefix, type IVscodeApi } from '../extension';
import {
	DelendaiStatusBar,
	type IStatusBarItem,
} from '../providers/status-bar';

/** Build a minimal `IVscodeApi` whose config returns the given prefix. */
const apiWithPrefix = (prefix: unknown): IVscodeApi =>
	({
		workspace: {
			getConfiguration: (section: string) => ({
				get: (key: string) =>
					section === 'delendai.server' && key === 'prefix'
						? prefix
						: undefined,
			}),
		},
	}) as unknown as IVscodeApi;

const createItem = (): IStatusBarItem => {
	const item = {
		text: '',
		show() {},
		dispose() {},
	} as IStatusBarItem;
	return item;
};

describe('resolveNamespacePrefix', () => {
	it('reads delendai.server.prefix from config', () => {
		expect(resolveNamespacePrefix(apiWithPrefix('acme'))).toBe('acme');
		expect(resolveNamespacePrefix(apiWithPrefix('acme_'))).toBe('acme_');
	});

	it('returns undefined for missing/blank prefix (keeps the default)', () => {
		expect(
			resolveNamespacePrefix(apiWithPrefix(undefined)),
		).toBeUndefined();
		expect(resolveNamespacePrefix(apiWithPrefix(''))).toBeUndefined();
		expect(resolveNamespacePrefix(apiWithPrefix('   '))).toBeUndefined();
		expect(resolveNamespacePrefix({} as IVscodeApi)).toBeUndefined();
	});
});

describe('status bar honours the namespace prefix', () => {
	const buildBar = (prefix: string | undefined, calls: string[]) =>
		new DelendaiStatusBar(
			createItem(),
			{
				async listTools() {
					return [];
				},
			},
			McpStdioClient.fromTransport({
				async callTool(input) {
					calls.push(input.name);
					if (input.name.endsWith('proposal_board')) {
						return { structuredContent: { proposals: [] } };
					}
					if (input.name.endsWith('_metrics')) {
						return {
							structuredContent: { totals: { totalBytes: 0 } },
						};
					}
					if (input.name.endsWith('agent_names')) {
						return { structuredContent: { agents: [] } };
					}
					return { structuredContent: {} };
				},
			}),
			undefined,
			undefined,
			undefined,
			prefix,
		);

	it('default prefix probes delendai_* tools', async () => {
		const calls: string[] = [];
		await buildBar(undefined, calls).update();
		expect(calls).toContain('delendai_proposals_proposal_board');
		expect(calls).toContain('delendai_metrics');
		expect(calls).toContain('delendai_proposals_agent_names');
	});

	it('custom prefix probes <prefix>_* tools', async () => {
		const calls: string[] = [];
		await buildBar('acme', calls).update();
		expect(calls).toContain('acme_proposals_proposal_board');
		expect(calls).toContain('acme_metrics');
		expect(calls).toContain('acme_proposals_agent_names');
		expect(calls.some((c) => c.startsWith('delendai_'))).toBe(false);
	});
});
