/**
 * status-bar-dispose.spec.ts — pinning contract for the reload-leak fix
 * in `extensions/vscode/src/providers/status-bar.ts`.
 *
 * Before this test, `McpVertexStatusBar.start()` called
 * `notifications.addEventListener(...)` three times and never removed
 * the listeners. On every window reload, three more listeners
 * accumulated on the same `NotificationsService`, multiplying the
 * `update()` traffic on every notification event.
 *
 * The contract: `dispose()` MUST call `removeEventListener` once per
 * `addEventListener` it called in `start()`, with the SAME callback
 * reference, and must be idempotent.
 */
import { describe, expect, it } from 'vitest';

import {
	McpVertexStatusBar,
	type IStatusBarItem,
} from '../providers/status-bar';

interface IRecordingNotifications {
	addCalls: string[];
	removeCalls: string[];
}

const fakeItem = (): IStatusBarItem => ({
	text: '',
	show() {},
	dispose() {},
});

const fakeNotifications = (
	recorder: IRecordingNotifications,
): {
	addEventListener: (type: string, cb: unknown) => void;
	removeEventListener: (type: string, cb: unknown) => void;
} => ({
	addEventListener(type, cb) {
		recorder.addCalls.push(type);
		// The shape is unknown in this contract — the real NotificationsService
		// accepts a typed callback; we only need to round-trip the reference.
		void cb;
	},
	removeEventListener(type, cb) {
		recorder.removeCalls.push(type);
		void cb;
	},
});

describe('McpVertexStatusBar disposal (reload-leak contract)', async () => {
	it('removes every listener it registered, with the same callback refs', async () => {
		const recorder: IRecordingNotifications = {
			addCalls: [],
			removeCalls: [],
		};
		const bar = new McpVertexStatusBar(
			fakeItem(),
			{
				async listTools() {
					return [];
				},
			},
			{
				async request() {
					return {} as never;
				},
			},
			fakeNotifications(recorder),
		);

		await bar.start();

		// Three listeners registered.
		expect(recorder.addCalls.sort()).toEqual([
			'bloqueado',
			'cap',
			'lock-released',
		]);

		bar.dispose();

		// Three listeners removed (one per registration).
		expect(recorder.removeCalls.sort()).toEqual([
			'bloqueado',
			'cap',
			'lock-released',
		]);
	});

	it('dispose() is idempotent — second call removes nothing extra', async () => {
		const recorder: IRecordingNotifications = {
			addCalls: [],
			removeCalls: [],
		};
		const bar = new McpVertexStatusBar(
			fakeItem(),
			{
				async listTools() {
					return [];
				},
			},
			{
				async request() {
					return {} as never;
				},
			},
			fakeNotifications(recorder),
		);
		await bar.start();
		bar.dispose();
		bar.dispose();

		expect(recorder.removeCalls).toHaveLength(3);
	});

	it('update() is a no-op after dispose() — does not crash on stale listeners', async () => {
		const recorder: IRecordingNotifications = {
			addCalls: [],
			removeCalls: [],
		};
		const bar = new McpVertexStatusBar(
			fakeItem(),
			{
				async listTools() {
					return [];
				},
			},
			{
				async request() {
					return {} as never;
				},
			},
			fakeNotifications(recorder),
		);
		await bar.start();
		bar.dispose();
		// Should not throw, even though the item is logically gone.
		await expect(bar.update()).resolves.toBeUndefined();
	});
});
