import { describe, expect, it } from 'vitest';

import { createLatestTaskQueue } from '../dev/render-queue';

describe('dev preview render queue', () => {
	it('finishes the active paint and coalesces pending navigation to the latest view', async () => {
		const painted: string[] = [];
		let releaseFirst: (() => void) | undefined;
		const first = new Promise<void>((resolve) => {
			releaseFirst = resolve;
		});
		const render = createLatestTaskQueue<string>(async (view) => {
			if (view === 'dashboard') await first;
			painted.push(view);
		});

		const active = render('dashboard');
		void render('settings');
		void render('configuration');
		releaseFirst?.();
		await active;

		expect(painted).toEqual(['dashboard', 'configuration']);
	});
});
