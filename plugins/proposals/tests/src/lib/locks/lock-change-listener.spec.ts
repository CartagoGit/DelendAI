import { describe, expect, it, vi } from 'vitest';

import {
	createCallbackLockListener,
	lockChangeMultiplexer,
	type ILockChangeEvent,
	type ILockChangeListener,
} from '@mcp-vertex/proposals/lib/locks/lock-change-listener';

describe('lock-change-listener (Solid ISP)', async () => {
	describe('createCallbackLockListener', async () => {
		it('forwards the event to the callback', async () => {
			const cb = vi.fn();
			const listener = createCallbackLockListener(cb);
			listener.onLockChanged({
				action: 'claim',
				agent: 'a1',
				taskId: 't1',
			});
			expect(cb).toHaveBeenCalledOnce();
			expect(cb).toHaveBeenCalledWith({
				action: 'claim',
				agent: 'a1',
				taskId: 't1',
			});
		});

		it('swallows callback exceptions (listener must never fail the tool)', async () => {
			const listener = createCallbackLockListener(() => {
				throw new Error('boom');
			});
			expect(() =>
				listener.onLockChanged({
					action: 'release',
					agent: 'a1',
					taskId: 't1',
				}),
			).not.toThrow();
		});
	});

	describe('lockChangeMultiplexer', async () => {
		const evt: ILockChangeEvent = {
			action: 'gc',
			agent: undefined,
			taskId: undefined,
		};

		it('delivers to every listener exactly once', async () => {
			const a = vi.fn();
			const b = vi.fn();
			const m = lockChangeMultiplexer([
				createCallbackLockListener(a),
				createCallbackLockListener(b),
			]);
			m.onLockChanged(evt);
			expect(a).toHaveBeenCalledOnce();
			expect(b).toHaveBeenCalledOnce();
		});

		it('keeps delivering even when one listener throws', async () => {
			const a = vi.fn();
			const b = vi.fn();
			const faulty: ILockChangeListener = {
				onLockChanged: () => {
					throw new Error('boom');
				},
			};
			const m = lockChangeMultiplexer([
				createCallbackLockListener(a),
				faulty,
				createCallbackLockListener(b),
			]);
			expect(() => m.onLockChanged(evt)).not.toThrow();
			expect(a).toHaveBeenCalledOnce();
			expect(b).toHaveBeenCalledOnce();
		});

		it('handles an empty listener list as a no-op', async () => {
			const m = lockChangeMultiplexer([]);
			expect(() => m.onLockChanged(evt)).not.toThrow();
		});
	});
});
