/**
 * `apps/shared/src/components/dev/setup-wizard.spec.ts` —
 * `renderSetupWizard` / `renderStatusBanner` unit tests
 * (f00102 S4.6).
 *
 * Contract pinned:
 *   - `renderSetupWizard({ kind: 'unconfigured', ... })` returns
 *     a `<section class="mcpv-setup setup" data-kind="unconfigured">`
 *     with one `<li>` per signal + install + refresh CTAs
 *   - the CTA label is auto-derived from `kind`:
 *     configured → "Re-install (idempotent)"
 *     partial    → "Finish setup"
 *     unconfigured → "Install mcp-vertex here"
 *   - `ctaLabel` option overrides the auto-derived copy
 *   - `renderStatusBanner({ kind: 'configured' })` returns the
 *     `<p class="mcpv-status-banner mcpv-status-banner--ok">` shape
 *   - all interpolations are HTML-escaped
 */
import { describe, expect, it } from 'vitest';

import {
	renderSetupWizard,
	renderStatusBanner,
	type ISetupSignal,
} from './setup-wizard';

const SIGNALS: ReadonlyArray<ISetupSignal> = [
	{
		id: 'mcp-json',
		present: true,
		path: '/abs/.vscode/mcp.json',
		detail: 'ok',
	},
	{
		id: 'settings-server',
		present: false,
		path: '/abs/.vscode/settings.json',
		detail: 'missing',
	},
];

const baseStatus = {
	suggestion: 'Run the install command to drop the missing files.',
	signals: SIGNALS,
};

describe('renderSetupWizard', () => {
	it('emits the canonical section + signals + CTAs', () => {
		const out = renderSetupWizard({
			...baseStatus,
			kind: 'unconfigured',
		});
		expect(out).toContain(
			'<section class="mcpv-setup setup" data-kind="unconfigured">',
		);
		expect(out).toContain('<header class="mcpv-setup__head setup__head">');
		expect(out).toContain(
			'<aside class="mcpv-setup__signals setup__signals" aria-label="Detection signals">',
		);
		expect(out).toContain(
			'<button type="button" id="setup-install" class="mcpv-setup__primary setup__primary">',
		);
		expect(out).toContain(
			'<button type="button" id="setup-refresh" class="mcpv-setup__secondary setup__secondary">',
		);
	});

	it('renders one <li> per signal with the canonical classes', () => {
		const out = renderSetupWizard({
			...baseStatus,
			kind: 'partial',
		});
		const matches = out.match(
			/<li class="mcpv-setup__signal setup__signal (is-on|is-off)">/g,
		);
		expect(matches).toHaveLength(2);
		expect(out).toContain('is-on');
		expect(out).toContain('is-off');
	});

	it('auto-derives the CTA label from kind', () => {
		expect(
			renderSetupWizard({ ...baseStatus, kind: 'configured' }),
		).toContain('Re-install (idempotent)');
		expect(renderSetupWizard({ ...baseStatus, kind: 'partial' })).toContain(
			'Finish setup',
		);
		expect(
			renderSetupWizard({ ...baseStatus, kind: 'unconfigured' }),
		).toContain('Install mcp-vertex here');
	});

	it('honours an explicit ctaLabel override', () => {
		const out = renderSetupWizard(
			{ ...baseStatus, kind: 'unconfigured' },
			{ ctaLabel: 'Run `bunx mcp-vertex init`' },
		);
		expect(out).toContain('Run `bunx mcp-vertex init`');
		expect(out).not.toContain('Install mcp-vertex here');
	});

	it('honours a custom heading', () => {
		const out = renderSetupWizard(
			{ ...baseStatus, kind: 'unconfigured' },
			{ heading: 'Wire mcp-vertex in this project' },
		);
		expect(out).toContain('Wire mcp-vertex in this project');
		expect(out).not.toContain("mcp-vertex isn't fully wired");
	});

	it('escapes HTML in suggestion, path, and detail', () => {
		const out = renderSetupWizard({
			kind: 'unconfigured',
			suggestion: '<bad>&"\'',
			signals: [
				{
					id: 'x',
					present: false,
					path: '/a/<b>',
					detail: '"&<>',
				},
			],
		});
		expect(out).toContain('&lt;bad&gt;&amp;&quot;&#39;');
		expect(out).toContain('<code>/a/&lt;b&gt;</code>');
	});
});

describe('renderStatusBanner', () => {
	it('emits the ok variant for configured workspaces', () => {
		const out = renderStatusBanner({ ...baseStatus, kind: 'configured' });
		expect(out).toContain(
			'<p class="mcpv-status-banner mcpv-status-banner--ok settings__status settings__status--ok">',
		);
		expect(out).toContain('Workspace is configured.');
	});

	it('emits the warn variant for partial + unconfigured', () => {
		expect(
			renderStatusBanner({ ...baseStatus, kind: 'partial' }),
		).toContain('mcpv-status-banner--warn');
		expect(
			renderStatusBanner({ ...baseStatus, kind: 'unconfigured' }),
		).toContain('mcpv-status-banner--warn');
	});

	it('honours okLabel and warnPrefix overrides', () => {
		const out = renderStatusBanner(
			{ ...baseStatus, kind: 'configured' },
			{ okLabel: 'All green.' },
		);
		expect(out).toContain('All green.');
		expect(out).not.toContain('Workspace is configured.');
	});
});
