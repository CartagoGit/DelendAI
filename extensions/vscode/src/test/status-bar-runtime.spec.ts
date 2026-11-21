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
	it('[<50ms] shows what the server runs in the tooltip, as the status tool words it', async () => {
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

		expect(item.tooltip).toMatchObject({
			value: expect.stringContaining('develop@abcdef123456 behind 2'),
		});
	});

	it('[<50ms] says the version is unknown when the server states no runtime', async () => {
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

		expect(item.tooltip).toMatchObject({
			value: expect.stringContaining('Version: unknown'),
		});
	});
});
