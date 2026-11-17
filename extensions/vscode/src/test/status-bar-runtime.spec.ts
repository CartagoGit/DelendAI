import { describe, it, expect } from 'vitest';

import { McpStdioClient } from '@delendai/client';

import {
	DelendaiStatusBar,
	type IStatusBarItem,
} from '../providers/status-bar';

const createItem = (): IStatusBarItem => ({
	text: '',
	show() {},
	dispose() {},
});

describe('the status-bar tooltip runtime state', () => {
	it('shows what the server runs in the tooltip, as the status tool words it [<50ms]', async () => {
		const item = createItem();
		const bar = new DelendaiStatusBar(
			item,
			{
				async listTools() {
					return [];
				},
			},
			McpStdioClient.fromTransport({
				async callTool(input) {
					if (input.name === 'delendai_status') {
						return {
							structuredContent: {
								collectors: {},
								errors: [],
								runtime: {
									summary: 'develop@abcdef123456 behind 2',
								},
							},
						};
					}
					return { structuredContent: {} };
				},
			}),
		);

		await bar.update();

		expect(item.tooltip).toBe(
			'delendai Dashboard (click to open)\ndevelop@abcdef123456 behind 2',
		);
	});

	it('keeps the plain tooltip when the server states no runtime [<50ms]', async () => {
		const item = createItem();
		const bar = new DelendaiStatusBar(
			item,
			{
				async listTools() {
					return [];
				},
			},
			McpStdioClient.fromTransport({
				async callTool() {
					return { structuredContent: {} };
				},
			}),
		);

		await bar.update();

		expect(item.tooltip).toBe('delendai Dashboard (click to open)');
	});
});
