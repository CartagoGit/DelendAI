import { describe, expect, it } from 'vitest';

import {
	ActiveViewStore,
	getActiveView,
	isViewId,
	knownViewIds,
	onActiveViewChange,
	resolvePostInstallTarget,
	setActiveView,
} from '../dev/state';

describe('ActiveViewStore', () => {
	it('starts on dashboard', () => {
		const store = new ActiveViewStore();
		expect(store.current).toBe('dashboard');
	});

	it('only fires listeners when the value actually changes', () => {
		const store = new ActiveViewStore();
		const seen: string[] = [];
		store.subscribe((id) => seen.push(id));
		store.setCurrent('dashboard');
		store.setCurrent('settings');
		store.setCurrent('settings');
		store.setCurrent('metrics');
		expect(seen).toEqual(['settings', 'metrics']);
	});

	it('lets a listener unsubscribe', () => {
		const store = new ActiveViewStore();
		const seen: string[] = [];
		const off = store.subscribe((id) => seen.push(id));
		store.setCurrent('settings');
		off();
		store.setCurrent('metrics');
		expect(seen).toEqual(['settings']);
	});
});

describe('state module surface', () => {
	it('exports the four canonical view ids', () => {
		expect([...knownViewIds()].sort()).toEqual(
			['dashboard', 'metrics', 'settings', 'tool-detail'].sort(),
		);
	});

	it('isViewId narrows safely', () => {
		expect(isViewId('dashboard')).toBe(true);
		expect(isViewId('settings')).toBe(true);
		expect(isViewId('tool-detail')).toBe(true);
		expect(isViewId('metrics')).toBe(true);
		expect(isViewId('bogus')).toBe(false);
		expect(isViewId('')).toBe(false);
	});

	it('resolvePostInstallTarget returns dashboard in every case', () => {
		expect(resolvePostInstallTarget('dashboard')).toBe('dashboard');
		expect(resolvePostInstallTarget('settings')).toBe('dashboard');
		expect(resolvePostInstallTarget('tool-detail')).toBe('dashboard');
		expect(resolvePostInstallTarget('metrics')).toBe('dashboard');
	});

	it('module-level getActiveView/setActiveView share one store', () => {
		const seen: string[] = [];
		const off = onActiveViewChange((id) => seen.push(id));
		try {
			setActiveView('settings');
			expect(getActiveView()).toBe('settings');
			setActiveView('settings'); // no-op, no listener fire
			setActiveView('tool-detail');
			expect(getActiveView()).toBe('tool-detail');
			expect(seen).toEqual(['settings', 'tool-detail']);
		} finally {
			off();
		}
		// Reset back to dashboard so other tests that depend on the
		// default get a stable starting point.
		setActiveView('dashboard');
	});
});
