import { describe, expect, it, vi } from 'vitest';

import { createStoreWatcher } from '../../../src/lib/services/store-watcher';

describe('store watcher', () => {
	it('closes the fs watcher on dispose and stays idempotent', () => {
		const close = vi.fn();
		const unref = vi.fn();
		const watchFactory = vi.fn(() => ({ close, unref }));
		const watcher = createStoreWatcher({
			dir: '/tmp',
			fileName: 'notes.json',
			onChange: vi.fn(),
			watchFactory: watchFactory as never,
		});

		expect(watcher.isActive()).toBe(true);
		expect(unref).toHaveBeenCalledTimes(1);
		watcher.dispose();
		watcher.dispose();
		expect(close).toHaveBeenCalledTimes(1);
		expect(watcher.isActive()).toBe(false);
	});

	it('ignores unrelated file changes and forwards the target file', () => {
		const onChange = vi.fn();
		let listener:
			| ((eventType: string, fileName: string | Buffer | null) => void)
			| undefined;
		const watchFactory = vi.fn(
			(
				_dir: string,
				_options: { persistent: false },
				cb: (
					eventType: string,
					fileName: string | Buffer | null,
				) => void,
			) => {
				listener = cb;
				return { close: vi.fn(), unref: vi.fn() };
			},
		);
		createStoreWatcher({
			dir: '/tmp',
			fileName: 'notes.json',
			onChange,
			watchFactory: watchFactory as never,
		});

		listener?.('change', 'other.json');
		listener?.('change', 'notes.json');
		listener?.('change', null);

		expect(onChange).toHaveBeenCalledTimes(2);
	});
});
