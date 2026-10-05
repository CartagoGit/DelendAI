import { McpStdioClient } from '@delendai/client';
import { describe, expect, it } from 'vitest';

import { ADOPT_COMMAND, registerAdoptCommand } from '../commands/adopt';
import type { ICommandVscodeApi } from '../commands/types';

const createHarness = (
	callTool: (input: {
		name: string;
		arguments?: object;
	}) => Promise<{ structuredContent?: unknown }>,
) => {
	const handlers = new Map<string, () => unknown>();
	const calls: { name: string; arguments?: object }[] = [];
	const panels: { html: string }[] = [];
	const errors: string[] = [];
	const vscode: ICommandVscodeApi = {
		ViewColumn: { One: 1 },
		commands: {
			registerCommand(command, callback) {
				handlers.set(command, callback as () => unknown);
				return { dispose() {} };
			},
		},
		window: {
			createWebviewPanel() {
				const panel = { webview: { html: '' } };
				panels.push(panel.webview);
				return panel;
			},
			async showErrorMessage(message) {
				errors.push(message);
				return undefined;
			},
		},
	};
	const client = McpStdioClient.fromTransport({
		async callTool(input) {
			calls.push(input);
			return callTool(input);
		},
	});
	registerAdoptCommand({ vscode, client });
	return { handlers, calls, panels, errors };
};

describe('delendai.adopt', () => {
	it('asks the server for an assessment only and renders the plan', async () => {
		const plan = {
			ok: true,
			preset: 'lean',
			wrote: false,
			created: [],
			skipped: [],
			residual: ['delendai.config.json'],
		};
		const { handlers, calls, panels } = createHarness(async () => ({
			structuredContent: plan,
		}));
		await handlers.get(ADOPT_COMMAND)?.();
		expect(calls).toHaveLength(1);
		expect(calls[0]?.name).toBe('delendai_adopt_project');
		expect(calls[0]?.arguments).toEqual({ analyze: true });
		expect(calls[0]?.arguments).not.toHaveProperty('write');
		expect(panels[0]?.html).toContain('delendai.config.json');
	});

	it('reports a failure instead of throwing when no server is reachable', async () => {
		const { handlers, panels, errors } = createHarness(async () => {
			throw new Error('MCP server is connecting');
		});
		await handlers.get(ADOPT_COMMAND)?.();
		expect(panels).toHaveLength(0);
		expect(errors[0]).toContain('adopt project failed');
	});
});
