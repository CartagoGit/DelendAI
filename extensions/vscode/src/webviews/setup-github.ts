/**
 * setup-github.ts — the multi-step webview that mirrors the web wizard
 * (`apps/web/src/pages/setup.astro`) and the canonical 7-step guide in
 * `docs/CROSS-PROJECT-SETUP.md` (f00030 S4).
 *
 * The webview is intentionally minimal: 7 steps, one per screen, each with a
 * Back / Next pair and a "Copy command" button. All state (the current step)
 * lives in the webview itself — closing it forgets the state; nothing is
 * persisted beyond what `issues_setup_github` writes to disk.
 *
 * This module is a pure HTML producer: strings + step commands in, a single
 * self-contained HTML document out (no `vscode` API, no I/O), so it is fully
 * unit-testable. The command wrapper (`commands/setup-github.ts`) creates the
 * panel and assigns this HTML.
 *
 * Hard rule (f00030 §5.4): the commands emitted here must agree with the
 * canonical guide / `PRESET_CATALOG`. We therefore use `--preset=full`
 * (a catalog id) rather than a hand-typed `--plugins=…` mirror of a preset's
 * full membership — which the `lint:setup` drift gate forbids.
 */
import type { ISetupGithubStrings } from '../i18n/strings';

/** The 7 canonical commands, in guide order. Kept in lockstep with the guide. */
export const SETUP_GITHUB_COMMANDS: readonly string[] = [
	'git remote get-url origin',
	'mcp-vertex setup-github',
	'gh auth status   # or: export GITHUB_TOKEN=<your-token>',
	JSON.stringify(
		{ plugins: { issues: { options: { repo: 'owner/name' } } } },
		null,
		'\t',
	),
	'bunx @mcp-vertex/core --preset=full',
	JSON.stringify(
		{
			servers: {
				'mcp-vertex': {
					command: 'bunx',
					args: ['@mcp-vertex/core', '--preset=full'],
				},
			},
		},
		null,
		'\t',
	),
	'mcp-vertex setup-github --mark-configured',
];

/** Canonical source-of-truth guide every surface links back to. */
export const SETUP_GITHUB_DOCS_URL =
	'https://github.com/cv2mario/mcp-vertex/blob/main/docs/CROSS-PROJECT-SETUP.md';

const escapeHtml = (value: string): string =>
	value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');

/**
 * Render the full setup-github webview HTML for one language.
 *
 * The 7 step `<section>`s are all emitted; only the first is visible. The
 * inline controller (no external deps) handles Back/Next visibility and the
 * clipboard copy, mirroring the website's copy-button behaviour.
 */
export const renderSetupGithubWebview = (
	strings: ISetupGithubStrings,
): string => {
	const total = strings.steps.length;
	const stepSections = strings.steps
		.map((step, i) => {
			const command = SETUP_GITHUB_COMMANDS[i] ?? '';
			const optional = i === total - 1;
			const label = strings.stepLabel
				.replace('{n}', String(i + 1))
				.replace('{total}', String(total));
			return `
		<section class="step" data-step="${i}" ${i === 0 ? '' : 'hidden'}>
			<p class="step-label">${escapeHtml(label)}</p>
			<h2 class="step-title">${escapeHtml(step.title)}${
				optional
					? ` <span class="step-optional">${escapeHtml(strings.optional)}</span>`
					: ''
			}</h2>
			<p class="step-body">${escapeHtml(step.body)}</p>
			<pre class="step-cmd"><code>${escapeHtml(command)}</code></pre>
			<button type="button" class="copy" data-command="${escapeHtml(command)}">${escapeHtml(strings.copy)}</button>
		</section>`;
		})
		.join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(strings.title)}</title>
	<style>
		body { font-family: var(--vscode-font-family, sans-serif); padding: 1rem; }
		.intro { opacity: 0.85; }
		.docs-link { display: inline-block; margin: 0.5rem 0 1rem; }
		.step-label { text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.75rem; opacity: 0.7; }
		.step-title { margin: 0.25rem 0; }
		.step-optional { font-size: 0.7rem; border: 1px solid currentColor; border-radius: 999px; padding: 0.05rem 0.4rem; opacity: 0.7; }
		.step-cmd { background: var(--vscode-textCodeBlock-background, #1e1e1e); padding: 0.6rem 0.8rem; border-radius: 6px; overflow-x: auto; }
		button { cursor: pointer; padding: 0.35rem 0.8rem; border-radius: 4px; border: 1px solid var(--vscode-button-border, transparent); background: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); }
		button[disabled] { opacity: 0.5; cursor: default; }
		.nav { display: flex; gap: 0.5rem; margin-top: 1.5rem; }
		.copy { background: transparent; color: inherit; border: 1px solid currentColor; }
	</style>
</head>
<body data-total="${total}">
	<h1>${escapeHtml(strings.title)}</h1>
	<p class="intro">${escapeHtml(strings.intro)}</p>
	<a class="docs-link" href="${SETUP_GITHUB_DOCS_URL}">${escapeHtml(strings.docsLink)}</a>
	<div class="steps">${stepSections}
	</div>
	<div class="nav">
		<button type="button" id="back" disabled>${escapeHtml(strings.back)}</button>
		<button type="button" id="next">${escapeHtml(strings.next)}</button>
	</div>
	<script>
		(function () {
			var total = Number(document.body.dataset.total || '0');
			var current = 0;
			var sections = Array.prototype.slice.call(
				document.querySelectorAll('.step')
			);
			var back = document.getElementById('back');
			var next = document.getElementById('next');
			var nextLabel = ${JSON.stringify(strings.next)};
			var finishLabel = ${JSON.stringify(strings.finish)};
			var copyLabel = ${JSON.stringify(strings.copy)};
			var copiedLabel = ${JSON.stringify(strings.copied)};
			function render() {
				sections.forEach(function (s, i) { s.hidden = i !== current; });
				back.disabled = current === 0;
				next.textContent = current === total - 1 ? finishLabel : nextLabel;
			}
			back.addEventListener('click', function () {
				if (current > 0) { current -= 1; render(); }
			});
			next.addEventListener('click', function () {
				if (current < total - 1) { current += 1; render(); }
			});
			document.querySelectorAll('.copy').forEach(function (btn) {
				btn.addEventListener('click', function () {
					var cmd = btn.getAttribute('data-command') || '';
					if (navigator.clipboard && navigator.clipboard.writeText) {
						navigator.clipboard.writeText(cmd);
					}
					btn.textContent = copiedLabel;
					setTimeout(function () { btn.textContent = copyLabel; }, 1500);
				});
			});
			render();
		})();
	</script>
</body>
</html>`;
};
