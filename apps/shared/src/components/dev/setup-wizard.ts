/**
 * `apps/shared/src/components/dev/setup-wizard.ts` — host-agnostic
 * setup wizard + status banner renderers. Return HTML strings.
 *
 * Replaces the inline `renderWizard` / `renderStatusBanner` helpers
 * in `extensions/vscode/src/dev/settings-panel.ts` (f00102 S4.6)
 * so any surface that wants the same "detection signals + CTA"
 * flow (a CLI init wizard, a JetBrains extension's first-launch
 * panel, a marketing-site onboarding page) can import the same
 * markup without forking the SCSS or the strings.
 *
 * The wizard intentionally avoids taking a host-specific
 * `ISetupStatus` interface — it accepts a small `ISetupWizardStatus`
 * shape that the host derives from its own status type. This keeps
 * the shared renderer decoupled from the dev-server's
 * `tools/scripts/dev/api/setup-status.ts` types (Node-only) so the
 * browser bundle does not pull in any server-side code.
 *
 * Conventions
 * -----------
 * - Class namespace: `mv-setup` / `mv-setup__*` for the wizard
 *   and `mv-status-banner` / `mv-status-banner--{ok,warn}` for
 *   the status banner. Legacy `setup__*` / `settings__status*`
 *   selectors are kept in the companion SCSS via `@extend`, so
 *   the existing dev preview keeps matching during the
 *   deprecation window.
 * - `suggestion` is shown as the hint paragraph at the top of
 *   the wizard; it is the host's free-form text describing what
 *   the user should do next ("run `bunx mcp-vertex init`", etc.).
 * - `signals` is the detection list — each row is one
 *   "is `<path>` present?" check, rendered with a ✓ or ·
 *   glyph plus the absolute path and an optional detail
 *   ("missing", "partial content", etc.).
 * - The CTA label is computed from `kind`:
 *   - `configured`    → "Re-install (idempotent)"
 *   - `partial`       → "Finish setup"
 *   - `unconfigured`  → "Install mcp-vertex here"
 *   Hosts that want different copy pass an explicit `ctaLabel`.
 */

export type SetupStatusKind = 'configured' | 'partial' | 'unconfigured';

export interface ISetupSignal {
	readonly id: string;
	readonly present: boolean;
	readonly path: string;
	readonly detail?: string;
}

export interface ISetupWizardStatus {
	readonly kind: SetupStatusKind;
	readonly suggestion: string;
	readonly signals: ReadonlyArray<ISetupSignal>;
}

export interface IRenderSetupWizardOptions {
	/** Override the auto-computed CTA label. */
	readonly ctaLabel?: string;
	/** Override the wizard's heading text. */
	readonly heading?: string;
}

const escapeAttr = (s: string): string =>
	s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');

const DEFAULT_CTA: Readonly<Record<SetupStatusKind, string>> = {
	configured: 'Re-install (idempotent)',
	partial: 'Finish setup',
	unconfigured: 'Install mcp-vertex here',
};

const DEFAULT_HEADING = "mcp-vertex isn't fully wired in this workspace";

export const renderSetupWizard = (
	status: ISetupWizardStatus,
	options: IRenderSetupWizardOptions = {},
): string => {
	const ctaLabel = options.ctaLabel ?? DEFAULT_CTA[status.kind];
	const heading = options.heading ?? DEFAULT_HEADING;
	const signalsHtml = status.signals
		.map(
			(s) =>
				`<li class="mv-setup__signal setup__signal ${s.present ? 'is-on' : 'is-off'}">
					<span class="mv-setup__signal-icon setup__signal-icon" aria-hidden="true">${s.present ? '✓' : '·'}</span>
					<code>${escapeAttr(s.path)}</code>
					${s.detail ? `<span class="mv-setup__signal-detail setup__signal-detail">— ${escapeAttr(s.detail)}</span>` : ''}
				</li>`,
		)
		.join('');

	return (
		`<section class="mv-setup setup" data-kind="${status.kind}">
			<header class="mv-setup__head setup__head">
				<h1>${escapeAttr(heading)}</h1>
				<p class="mv-setup__hint setup__hint">${escapeAttr(status.suggestion)}</p>
			</header>
			<aside class="mv-setup__signals setup__signals" aria-label="Detection signals">
				<h2>Detection</h2>
				<ul>${signalsHtml}</ul>
			</aside>
			<footer class="mv-setup__cta setup__cta">
				<button type="button" id="setup-install" class="mv-setup__primary setup__primary">${escapeAttr(ctaLabel)}</button>
				<button type="button" id="setup-refresh" class="mv-setup__secondary setup__secondary">Re-check</button>
				<span class="mv-setup__status setup__status" id="setup-status" role="status" aria-live="polite"></span>
			</footer>
		</section>`
	);
};

export interface IRenderStatusBannerOptions {
	/** Override the "configured" copy. */
	readonly okLabel?: string;
	/** Override the prefix before the kind label. */
	readonly warnPrefix?: string;
}

const DEFAULT_OK = 'Workspace is configured. The dashboard should be fetching real data on the <code>Dashboard</code> tab.';

export const renderStatusBanner = (
	status: ISetupWizardStatus,
	options: IRenderStatusBannerOptions = {},
): string => {
	const okLabel = options.okLabel ?? DEFAULT_OK;
	if (status.kind === 'configured') {
		return (
			`<p class="mv-status-banner mv-status-banner--ok settings__status settings__status--ok">` +
			`<span class="mv-setup__signal-icon setup__signal-icon">✓</span>` +
			` ${okLabel}` +
			`</p>`
		);
	}
	const verb = status.kind === 'partial' ? 'Finish' : 'Run';
	const prefix = options.warnPrefix ?? `Workspace isn't fully wired (${status.kind}). ${verb} the setup below to drop the missing files.`;
	return (
		`<p class="mv-status-banner mv-status-banner--warn settings__status settings__status--warn">` +
		`<span class="mv-setup__signal-icon setup__signal-icon">!</span>` +
		` ${escapeAttr(prefix)}` +
		`</p>`
	);
};