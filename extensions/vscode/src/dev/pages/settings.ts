/**
 * `extensions/vscode/src/dev/pages/settings.ts` — settings
 * view, lazily loaded.
 *
 * Mounts the shared `mountSettingsPanel` from
 * `../settings-panel.ts` (which itself lazy-loads
 * `renderSetupWizard` and friends from
 * `@mcp-vertex/shared/components/dev/…` on first render).
 *
 * The settings page also exposes the `navigate` callback to
 * the install-handler so a successful install can route back
 * to the dashboard (the orchestrator wires that closure at
 * registration time).
 */
import type { Lang } from '@mcp-vertex/shared/i18n';

import {
	mountSettingsPanel,
	readPersistedPrefs,
	type ISetupStatus,
} from '../settings-panel';
import { getActiveView } from '../state';

import type { IPage } from './contract';

export interface ISettingsPageOptions {
	readonly navigate: (id: 'dashboard') => Promise<void> | void;
}

export const createSettingsPage = (options: ISettingsPageOptions): IPage => ({
	id: 'settings',
	label: 'settings',
	async render(root, deps) {
		const status = (deps.status ?? {
			kind: 'unconfigured',
			signals: [],
			nextStep: 'manual',
			suggestion:
				'Dev server unreachable — could not detect workspace state.',
		}) as ISetupStatus;

		const prefs = readPersistedPrefs();
		const currentPrefs: { lang: Lang; theme: typeof prefs.theme } = {
			...prefs,
			lang: deps.lang,
		};

		mountSettingsPanel(
			root,
			status,
			currentPrefs,
			async () => {
				const res = await fetch('/api/setup/install', {
					method: 'POST',
				});
				const body = (await res.json().catch(() => null)) as {
					note: string;
				} | null;
				// After a successful install the user almost always
				// wants the dashboard. The orchestrator decides
				// whether the route is allowed (it knows if the
				// previous view was the welcome screen).
				if (body?.note) void options.navigate('dashboard');
				return body?.note ? { note: body.note } : null;
			},
			(lang: Lang) => {
				// Re-render the dashboard with the new dict if it's
				// the live view. We deliberately do NOT navigate
				// away from settings — the user is configuring
				// things, the language change is local to the
				// dashboard's i18n, not a page switch.
				if (getActiveView() === 'dashboard') {
					// Trigger a soft re-render by dispatching a
					// custom event the orchestrator listens to.
					window.dispatchEvent(
						new CustomEvent('mcpv:dev:lang-changed', {
							detail: lang,
						}),
					);
				}
			},
		);
	},
});
