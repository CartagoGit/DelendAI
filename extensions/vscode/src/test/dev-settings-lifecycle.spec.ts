import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountSettingsPanel, type ISetupStatus } from '../dev/settings-panel';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('dev settings mount lifecycle', () => {
	it('cannot repaint settings after install navigates to dashboard', async () => {
		let installListener: (() => Promise<void>) | undefined;
		const installButton = {
			disabled: false,
			addEventListener(_event: string, listener: () => Promise<void>) {
				installListener = listener;
			},
		};
		const statusSpan = { textContent: '' };
		const root = {
			innerHTML: '',
			querySelector(selector: string) {
				if (selector === '#setup-install') return installButton;
				if (selector === '#setup-status') return statusSpan;
				return null;
			},
			querySelectorAll() {
				return [];
			},
		} as unknown as HTMLElement;
		vi.stubGlobal('document', {
			head: { querySelector: () => ({}) },
		});
		const scheduled: Array<() => void> = [];
		vi.stubGlobal('window', {
			location: { search: '' },
			setTimeout(callback: () => void) {
				scheduled.push(callback);
				return scheduled.length;
			},
			clearTimeout: vi.fn(),
		});
		const fetchSpy = vi.fn();
		vi.stubGlobal('fetch', fetchSpy);

		const status: ISetupStatus = {
			kind: 'unconfigured',
			signals: [],
			nextStep: 'install',
			suggestion: 'Install delendai',
		};
		let mounted: ReturnType<typeof mountSettingsPanel>;
		mounted = mountSettingsPanel(
			root,
			status,
			{ theme: 'system', lang: 'en' },
			async () => {
				mounted.dispose();
				root.innerHTML = '<main id="dashboard">Dashboard</main>';
				return { note: 'Installed' };
			},
			() => undefined,
		);

		expect(installListener).toBeTypeOf('function');
		await installListener?.();
		expect(root.innerHTML).toContain('id="dashboard"');
		expect(scheduled).toHaveLength(0);
		expect(fetchSpy).not.toHaveBeenCalled();
	});
});
