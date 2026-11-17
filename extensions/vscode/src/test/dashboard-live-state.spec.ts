/**
 * dashboard-live-state.spec.ts — f00800 S3: the dashboard answers what is
 * happening now (units, publications, queue, blocked mutations, tokens),
 * refreshed by the server's event stream and not by polling every panel.
 */
import { describe, expect, it } from 'vitest';

import { McpStdioClient, type IDashboardAllModels } from '@delendai/client';
import { fakePartial, waitUntil } from '@delendai/test-kit';
import type {
	IHostAdapter,
	IWebviewPanel,
} from '@delendai/ui-extension/public';

import {
	DashboardWebviewViewProvider,
	renderLiveSection,
	toLiveState,
} from '../providers/dashboard-webview-view-provider';

const status = {
	ok: true,
	code: 0,
	data: {
		computeSlot: { holder: 'agent-a', urgent: [{ label: 'fix main' }] },
		anchorRefusal: 'checkout is not on develop',
		undurable: ['a.ts'],
		units: { live: 2, idle: 1 },
		publications: [
			{ ref: 'pr/x', behind: 3, overlapping: 1, ownerAlive: false },
		],
		waitingOnAuthor: [{ number: 7, headRef: 'pr/y', why: 'red check' }],
		orphans: [{ ref: 'wip/z', reason: 'silent' }],
	},
};

describe('dashboard live state', () => {
	it('[<20ms] flattens a work status payload and tolerates a bare one', () => {
		const live = toLiveState(status.data);
		expect(live.units).toEqual({ live: 2, idle: 1 });
		expect(live.computeHolder).toBe('agent-a');
		expect(live.urgent).toEqual(['fix main']);
		expect(live.publications[0]?.ownerAlive).toBe(false);
		expect(live.blocked).toEqual([
			'checkout is not on develop',
			'undurable edit: a.ts',
			'wip/z: silent',
			'pr/y: red check',
		]);
		expect(toLiveState(undefined).blocked).toEqual([]);
	});

	it('[<20ms] renders every question and escapes server text', () => {
		const live = toLiveState({
			...status.data,
			anchorRefusal: '<script>x</script>',
		});
		const html = renderLiveSection(
			live,
			fakePartial<IDashboardAllModels>({
				health: fakePartial<IDashboardAllModels['health']>({
					queue: {
						length: 4,
						queued: 2,
						orphans: 0,
						oldestAgeMinutes: 9,
						threshold: 'ok',
					},
				}),
				tokens: fakePartial<IDashboardAllModels['tokens']>({
					tokensUsed: 10,
					tokensSaved: 5,
					savingsPercent: 33,
				}),
			}),
		);
		expect(html).toContain('Units');
		expect(html).toContain('pr/x: 3 behind, 1 overlapping, owner gone');
		expect(html).toContain('waiting: 2 of 4, oldest 9 min');
		expect(html).toContain('compute slot: agent-a');
		expect(html).toContain('used: 10');
		expect(html).not.toContain('<script>');
	});

	it('[<500ms] an event re-reads the live state once and re-renders', async () => {
		let workCalls = 0;
		let subscribed = 0;
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				if (input.name === 'delendai_work') {
					workCalls += 1;
					return {
						structuredContent: {
							...status,
							data: {
								...status.data,
								units: { live: workCalls },
							},
						},
					};
				}
				if (input.name === 'delendai_logs_subscribe') {
					subscribed += 1;
					return {
						structuredContent: {
							stream: 'logs',
							events: [
								{
									ts: '2026-11-17T00:00:00Z',
									kind: 'tool',
									agent: 'a',
									summary: 'event',
									outcome: 'ok',
									files: [],
									meta: {},
								},
							],
						},
					};
				}
				return { structuredContent: {} };
			},
			async listTools() {
				return { tools: [] };
			},
		});
		const htmls: string[] = [];
		let dispose: (() => void) | undefined;
		const view = fakePartial<IWebviewPanel>({
			id: 'live',
			visible: true,
			webview: {
				options: {},
				html: '',
				setHtml(html: string) {
					htmls.push(html);
				},
				postMessage: async () => {},
				onDidReceiveMessage: () => ({ dispose() {} }),
			},
			reveal() {},
			dispose() {},
			onDidDispose(handler: () => void) {
				dispose = handler;
				return { dispose() {} };
			},
		});
		const provider = new DashboardWebviewViewProvider({
			host: fakePartial<IHostAdapter>({}),
			client,
			getConfig: () => ({}),
		});
		await provider.resolveWebviewView(view);
		await waitUntil(
			'the event re-renders the section',
			() => htmls.length >= 2,
		);
		dispose?.();
		expect(subscribed).toBeGreaterThan(0);
		expect(htmls.at(-1)).toContain('id="delendai-live"');
		expect(htmls.at(-1)).toContain('live: 2');
	});
});
