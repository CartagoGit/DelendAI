import { describe, expect, it } from 'vitest';

import type { INotificationEventName } from '@delendai/client';
import { McpStdioClient, NotificationsService } from '@delendai/client';
import { waitUntil } from '@delendai/test-kit';

import {
	DelendaiStatusBar,
	type IStatusBarItem,
	type IStatusBarEventConfig,
} from '../providers/status-bar';

const createItem = (): IStatusBarItem & {
	shown: boolean;
	disposed: boolean;
} => {
	const item = {
		text: '',
		shown: false,
		disposed: false,
		show() {
			this.shown = true;
		},
		dispose() {
			this.disposed = true;
		},
	} as IStatusBarItem & { shown: boolean; disposed: boolean };
	return item;
};

const overview = {
	async listTools() {
		return [];
	},
};

const serverAnswering = (
	units: Record<string, number> = { live: 2 },
): McpStdioClient =>
	McpStdioClient.fromTransport({
		async callTool(input) {
			if (input.name === 'delendai_status') {
				return {
					structuredContent: {
						runtime: { summary: 'develop@abc behind 2' },
						maintenance: { maintains: false, maintainer: 'pid 42' },
					},
				};
			}
			if (input.name === 'delendai_work') {
				return {
					structuredContent: {
						data: {
							computeSlot: { holder: 'agent-a' },
							units,
							publications: [{ ref: 'pr/x' }, { ref: 'pr/y' }],
						},
					},
				};
			}
			return { structuredContent: {} };
		},
	});

const tooltipOf = (item: IStatusBarItem): string => {
	const tip = item.tooltip;
	return typeof tip === 'object' ? tip.value : (tip ?? '');
};

describe('DelendaiStatusBar', async () => {
	it('[<50ms] labels the item DelendAI and puts the live data in a rich tooltip', async () => {
		const item = createItem();
		const bar = new DelendaiStatusBar(item, overview, serverAnswering());

		await bar.start();
		await bar.update();

		expect(item.text).toBe('DelendAI');
		const tip = tooltipOf(item);
		expect(typeof item.tooltip).toBe('object');
		expect(tip).toContain('develop@abc behind 2');
		expect(tip).toContain('Connection: connected');
		expect(tip).toContain('Maintained by: pid 42');
		expect(tip).toContain('Compute slot: agent\\-a');
		expect(tip).toContain('Active units: 2 live');
		expect(tip).toContain('Open PRs: 2');
		expect(item.command).toBe('delendai.openDashboard');
		expect(item.shown).toBe(true);
	});

	it('[<50ms] says it is not connected when the server answers nothing', async () => {
		const item = createItem();
		const bar = new DelendaiStatusBar(
			item,
			overview,
			McpStdioClient.fromTransport({
				async callTool() {
					throw new Error('tool missing');
				},
			}),
		);
		await bar.start();
		await bar.update();
		expect(item.text).toBe('DelendAI');
		expect(tooltipOf(item)).toContain('not connected');
	});

	it('[<200ms] rewrites the tooltip when a notification arrives, with no timer', async () => {
		const item = createItem();
		let units: Record<string, number> = { live: 1 };
		const client = McpStdioClient.fromTransport({
			async callTool(input) {
				if (input.name === 'delendai_work') {
					return { structuredContent: { data: { units } } };
				}
				return { structuredContent: {} };
			},
		});
		const notifications = new NotificationsService(client);
		const bar = new DelendaiStatusBar(
			item,
			overview,
			client,
			notifications,
		);

		await bar.start();
		await bar.update();
		expect(tooltipOf(item)).toContain('Active units: 1 live');

		units = { live: 3 };
		notifications.emitStatus('cap', 'checkpoint');
		await waitUntil('the tooltip shows 3 live units', () =>
			tooltipOf(item).includes('3 live'),
		);

		expect(tooltipOf(item)).toContain('Active units: 3 live');
	});

	it('[<50ms] a click opens the dashboard directly', async () => {
		const item = createItem();
		const bar = new DelendaiStatusBar(item, overview, serverAnswering());
		await bar.start();
		expect(item.command).toBe('delendai.openDashboard');
		expect(tooltipOf(item)).toContain('Click to open the dashboard');
	});
});

describe('the status-bar tooltip class', () => {
	it('[<50ms] is built by the host MarkdownString factory when one is given', async () => {
		const item = createItem();
		const built: string[] = [];
		const bar = new DelendaiStatusBar(
			item,
			overview,
			serverAnswering(),
			undefined,
			undefined,
			undefined,
			undefined,
			(value) => {
				built.push(value);
				return { value, isTrusted: false };
			},
		);

		await bar.update();

		expect(built.length).toBeGreaterThan(0);
		expect(tooltipOf(item)).toBe(built.at(-1));
	});
});

describe('STATUS_BAR_EVENTS discriminated union (H30)', () => {
	it('[<50ms] subscribes to every union event and removes them on dispose', async () => {
		const subscribed: string[] = [];
		const removed: string[] = [];
		const notifications = {
			addEventListener(name: INotificationEventName): void {
				subscribed.push(name);
			},
			removeEventListener(name: INotificationEventName): void {
				removed.push(name);
			},
		};
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
			notifications as never,
		);
		await bar.start();
		// Every canonical notification event name is subscribed.
		expect(subscribed.sort()).toEqual(
			['bloqueado', 'cap', 'lock-released'].sort(),
		);
		bar.dispose();
		expect(removed.sort()).toEqual(subscribed.sort());
	});

	it('[<50ms] keys the config map on the discriminated union (compile-time OCP)', () => {
		// A status-bar event config is the value shape of the exhaustive
		// map. Adding a new INotificationEventName without a map entry is a
		// *compile* error in status-bar.ts (Record<INotificationEventName>),
		// which is the H30 guarantee. This runtime assertion only pins the
		// locale-neutral reason codes so the union stays i18n-clean.
		const reasons: ReadonlyArray<IStatusBarEventConfig['reason']> = [
			'lock',
			'capacity',
			'blocked',
		];
		expect(reasons).toContain('lock');
		// @ts-expect-error — a Spanish/English literal is not a valid reason.
		const bad: IStatusBarEventConfig['reason'] = 'bloqueado';
		expect(bad).toBeDefined();
	});
});
