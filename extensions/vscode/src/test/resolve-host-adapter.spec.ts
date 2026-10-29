import { describe, expect, it } from 'vitest';

import type { IHostAdapter } from '@delendai/ui-extension/public';

import type { IVscodeApi } from '../extension';
import { resolveHostAdapter } from '../host/resolve-host-adapter';

const createVscode = (shown: string[] = []): IVscodeApi => ({
	ViewColumn: { One: 1 },
	commands: { registerCommand: () => ({ dispose() {} }) },
	window: {
		createWebviewPanel: () => ({ webview: { html: '' } }),
		showErrorMessage: (message: string) => {
			shown.push(message);
			return Promise.resolve(undefined);
		},
	},
});

describe('the host the extension registers its surfaces on', () => {
	it('is the loaded adapter in the real editor', async () => {
		const real = { id: 'vscode' } as Partial<IHostAdapter> as IHostAdapter;

		const host = await resolveHostAdapter(createVscode(), undefined, () =>
			Promise.resolve(real),
		);

		expect(host).toBe(real);
	});

	it('is nothing, and says why, when the adapter cannot be loaded', async () => {
		const shown: string[] = [];

		const host = await resolveHostAdapter(
			createVscode(shown),
			undefined,
			() => Promise.reject(new Error('Cannot find module vscode')),
		);

		expect(host).toBeUndefined();
		expect(shown).toHaveLength(1);
		expect(shown[0]).toContain('Cannot find module vscode');
	});

	it('loads the real adapter by default, which only the editor can give', async () => {
		const shown: string[] = [];

		// Outside the editor there is no `vscode` module to import: the
		// default loader fails, and the failure is what the user is shown.
		const host = await resolveHostAdapter(createVscode(shown), undefined);

		expect(host).toBeUndefined();
		expect(shown[0]).toContain('the host adapter failed to load');
	});

	it('is the minimal adapter for an injected API, never loading the real one', async () => {
		let loaded = false;

		const host = await resolveHostAdapter(
			createVscode(),
			createVscode(),
			() => {
				loaded = true;
				return Promise.reject(new Error('unreachable'));
			},
		);

		expect(host?.id).toBe('vscode-stub');
		expect(loaded).toBe(false);
	});
});
