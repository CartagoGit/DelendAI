/**
 * proposal-detail-webview.ts — f00097 S3 (evolves the open-proposal panel).
 *
 * Renders one proposal's read-only detail as four cards — Header, Slices,
 * Diagnose, Logs — from the `IProposalDetail` the snapshot layer builds
 * (`proposal_board` summary + `proposal_diagnose` + a proposal-filtered
 * `logs_tail`). Pure string render: no `vscode` import, no scripts, so it is
 * unit-testable and safe under a strict CSP.
 *
 * Security: the shared `DEFAULT_DENY` policy (`script-src 'none'`,
 * `style-src 'self' 'unsafe-inline'`) injected via `injectCspMeta` — stricter
 * than the proposal's aspirational `default-src 'self'` and consistent with
 * every other mcp-vertex webview. The view has no behaviour, only projection;
 * styles are inlined (self-contained, like the agent-catalog webview) so no
 * external resource root / `asWebviewUri` plumbing is needed. The tool has
 * already redacted the log lines; this view never re-redacts and never mutates.
 *
 * The board node's slice-click "open the markdown file" affordance is left to
 * the editor / board (it would need `enableScripts` + command URIs); this card
 * is observational, matching the proposal's read-only contract.
 */
import { DEFAULT_DENY, injectCspMeta } from '@mcp-vertex/ui-extension/webview';

import type { IProposalDetail } from '../lib/proposals-snapshot';
import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';
import { viewCopyFor } from '../i18n/view-copy.strings';
import { escapeHtml } from './render-output-schema';

const badge = (status: string): string =>
	`<span class="badge badge--${escapeHtml(status.replace(/[^a-z0-9]+/gi, '-').toLowerCase())}">${escapeHtml(status)}</span>`;

// English-only copy for the proposal detail: the user's bug report
// explicitly asked for English error/status labels in the extension UI.
// The shared `viewCopyFor(lang)` still translates when a host wants
// Spanish, but the *new* fields below (Plan / Agents / Progress) stay
// in English to avoid partial translations that hide keywords the
// user is searching for.
const enCopy = {
	plan: 'Plan',
	noPlan: 'No plan file is attached to this proposal.',
	agents: 'Agents working',
	noAgents: 'No agents are currently working on this proposal.',
	progress: 'Progress',
	eta: 'Estimated remaining',
	etaShort: 'ETA',
	done: 'done',
	inProgress: 'in progress',
	pending: 'pending',
	slicesWord: 'slices',
};

const headerCard = (detail: IProposalDetail, copy: IViewCopy): string => {
	const status =
		detail.summary?.status ?? asText(detail.diagnose?.status) ?? '—';
	const folder = asText(detail.diagnose?.folder);
	const owners = Array.isArray(detail.diagnose?.lockOwners)
		? detail.diagnose?.lockOwners.filter(
				(o): o is string => typeof o === 'string',
			)
		: [];
	const claimable = detail.summary?.claimableSliceIds.length ?? 0;
	return `<section class="card">
		<h1>${escapeHtml(detail.id)} ${badge(status)}</h1>
		<dl>
			${folder === undefined ? '' : `<dt>${escapeHtml(copy.folder)}</dt><dd>${escapeHtml(folder)}</dd>`}
			<dt>${escapeHtml(copy.slices)}</dt><dd>${detail.summary?.slices.length ?? 0} (${claimable} ${escapeHtml(copy.claimableNow)})</dd>
			${owners.length === 0 ? '' : `<dt>${escapeHtml(copy.lockOwners)}</dt><dd>${escapeHtml(owners.join(', '))}</dd>`}
		</dl>
	</section>`;
};

const progressBar = (percent: number): string => {
	const safe = Math.max(0, Math.min(100, percent));
	return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${safe}">
		<div class="progress__bar" style="width:${safe}%"></div>
		<span class="progress__label">${safe}%</span>
	</div>`;
};

const progressCard = (detail: IProposalDetail): string => {
	const progress = detail.progress;
	const etaText =
		progress.etaLabel === undefined
			? detail.summary === undefined
				? '—'
				: 'not enough history yet'
			: progress.etaLabel;
	const etaIso = progress.eta ?? '—';
	return `<section class="card">
		<h2>${escapeHtml(enCopy.progress)}</h2>
		${progressBar(progress.percent)}
		<dl>
			<dt>${escapeHtml(enCopy.done)}</dt><dd>${progress.done} / ${progress.total} ${escapeHtml(enCopy.slicesWord)}</dd>
			<dt>${escapeHtml(enCopy.inProgress)}</dt><dd>${progress.inProgress}</dd>
			<dt>${escapeHtml(enCopy.pending)}</dt><dd>${progress.pending}</dd>
			<dt>${escapeHtml(enCopy.etaShort)}</dt><dd>${escapeHtml(etaText)} <span class="muted">(${escapeHtml(etaIso)})</span></dd>
		</dl>
	</section>`;
};

const agentsCard = (detail: IProposalDetail): string => {
	const agents = detail.agents ?? [];
	if (agents.length === 0) {
		return `<section class="card">
			<h2>${escapeHtml(enCopy.agents)} (0)</h2>
			<p class="muted">${escapeHtml(enCopy.noAgents)}</p>
		</section>`;
	}
	const rows = agents
		.map(
			(agent) =>
				`<li><strong>${escapeHtml(agent.name)}</strong>${agent.taskId === null ? '' : ` <span class="muted">on ${escapeHtml(agent.taskId)}</span>`}</li>`,
		)
		.join('');
	return `<section class="card">
		<h2>${escapeHtml(enCopy.agents)} (${agents.length})</h2>
		<ul class="agents">${rows}</ul>
	</section>`;
};

const agentsCard = (detail: IProposalDetail): string => {
	if (detail.agents.length === 0) {
		return `<section class="card">
			<h2>${escapeHtml(enCopy.agents)} (0)</h2>
			<p class="muted">${escapeHtml(enCopy.noAgents)}</p>
		</section>`;
	}
	const rows = detail.agents
		.map(
			(agent) =>
				`<li><strong>${escapeHtml(agent.name)}</strong>${agent.taskId === null ? '' : ` <span class="muted">on ${escapeHtml(agent.taskId)}</span>`}</li>`,
		)
		.join('');
	return `<section class="card">
		<h2>${escapeHtml(enCopy.agents)} (${detail.agents.length})</h2>
		<ul class="agents">${rows}</ul>
	</section>`;
};

const planCard = (detail: IProposalDetail): string => {
	if (detail.planMarkdown === undefined || detail.planMarkdown.length === 0) {
		return `<section class="card">
			<h2>${escapeHtml(enCopy.plan)}</h2>
			<p class="muted">${escapeHtml(enCopy.noPlan)}</p>
		</section>`;
	}
	// Tiny markdown-to-HTML: headings, code blocks, lists and paragraphs.
	// The plan comes from a local markdown file under the proposal
	// folder; we never re-redact (the proposal layer already trusts it)
	// but we still escape every line so embedded HTML/JS cannot inject.
	const html = renderMarkdownSafe(detail.planMarkdown);
	return `<section class="card">
		<h2>${escapeHtml(enCopy.plan)}</h2>
		<article class="plan">${html}</article>
	</section>`;
};

const renderMarkdownSafe = (raw: string): string => {
	const lines = raw.split(/\r?\n/);
	const out: string[] = [];
	let inCode = false;
	let paragraph: string[] = [];
	const flushParagraph = (): void => {
		if (paragraph.length === 0) return;
		out.push(`<p>${paragraph.map(escapeHtml).join(' ')}</p>`);
		paragraph = [];
	};
	for (const line of lines) {
		if (line.startsWith('```')) {
			flushParagraph();
			if (!inCode) {
				out.push('<pre><code>');
				inCode = true;
			} else {
				out.push('</code></pre>');
				inCode = false;
			}
			continue;
		}
		if (inCode) {
			out.push(escapeHtml(line));
			continue;
		}
		if (line.trim().length === 0) {
			flushParagraph();
			continue;
		}
		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading !== null) {
			flushParagraph();
			const level = heading[1]?.length ?? 1;
			out.push(`<h${level}>${escapeHtml(heading[2] ?? '')}</h${level}>`);
			continue;
		}
		if (/^\s*[-*]\s+/.test(line)) {
			flushParagraph();
			out.push(`<li>${escapeHtml(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
			continue;
		}
		paragraph.push(line);
	}
	flushParagraph();
	if (inCode) out.push('</code></pre>');
	return out.join('\n');
};

const slicesCard = (detail: IProposalDetail, copy: IViewCopy): string => {
	const slices = detail.summary?.slices ?? [];
	if (detail.summary === undefined) {
		return `<section class="card"><h2>${escapeHtml(copy.slices)}</h2><p class="muted">${escapeHtml(copy.notActionable)}</p></section>`;
	}
	const rows = slices
		.map(
			(s) => `<tr>
				<td><code>${escapeHtml(s.sliceId)}</code></td>
				<td>${badge(s.status)}</td>
				<td>${s.owner === null ? '<span class="muted">—</span>' : escapeHtml(s.owner)}</td>
			</tr>`,
		)
		.join('');
	return `<section class="card">
		<h2>${escapeHtml(copy.slices)} (${slices.length})</h2>
		${slices.length === 0 ? `<p class="muted">${escapeHtml(copy.noSlices)}</p>` : `<table><thead><tr><th>${escapeHtml(copy.slice)}</th><th>${escapeHtml(copy.status)}</th><th>${escapeHtml(copy.owner)}</th></tr></thead><tbody>${rows}</tbody></table>`}
	</section>`;
};

const diagnoseCard = (detail: IProposalDetail, copy: IViewCopy): string => {
	if (detail.diagnose === undefined) {
		return `<section class="card"><h2>${escapeHtml(copy.diagnose)}</h2><p class="muted">${escapeHtml(copy.noDiagnosis)}</p></section>`;
	}
	const rows = Object.entries(detail.diagnose)
		.filter(([, value]) => value !== undefined && value !== null)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(
			([key, value]) =>
				`<tr><td><strong>${escapeHtml(key)}</strong></td><td>${escapeHtml(stringifyValue(value))}</td></tr>`,
		)
		.join('');
	return `<section class="card">
		<h2>${escapeHtml(copy.diagnose)}</h2>
		${rows === '' ? `<p class="muted">${escapeHtml(copy.emptyDiagnosis)}</p>` : `<table class="kv"><tbody>${rows}</tbody></table>`}
	</section>`;
};

const logsCard = (detail: IProposalDetail, copy: IViewCopy): string => {
	if (detail.logs.length === 0) {
		return `<section class="card"><h2>${escapeHtml(copy.logs)}</h2><p class="muted">${escapeHtml(copy.noLogs)}</p></section>`;
	}
	const rows = detail.logs
		.map(
			(e) => `<tr>
				<td class="ts">${escapeHtml(e.ts)}</td>
				<td><code>${escapeHtml(e.kind)}</code></td>
				<td>${e.agent === null ? '<span class="muted">—</span>' : escapeHtml(e.agent)}</td>
				<td>${escapeHtml(e.summary)}</td>
			</tr>`,
		)
		.join('');
	return `<section class="card">
		<h2>${escapeHtml(copy.logs)} (${detail.logs.length})</h2>
		<table><thead><tr><th>${escapeHtml(copy.time)}</th><th>${escapeHtml(copy.kind)}</th><th>${escapeHtml(copy.agent)}</th><th>${escapeHtml(copy.summary)}</th></tr></thead><tbody>${rows}</tbody></table>
	</section>`;
};

export const renderProposalDetailHtml = (
	detail: IProposalDetail,
	copy: IViewCopy = viewCopyFor('en'),
): string =>
	injectCspMeta(
		`<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(detail.id)}</title>
	<style>${DETAIL_CSS}</style>
</head>
<body>
	${headerCard(detail, copy)}
	${progressCard(detail)}
	${agentsCard(detail)}
	${planCard(detail)}
	${slicesCard(detail, copy)}
	${diagnoseCard(detail, copy)}
	${logsCard(detail, copy)}
</body>
</html>`,
		DEFAULT_DENY,
	);

const asText = (value: unknown): string | undefined =>
	typeof value === 'string' ? value : undefined;

const stringifyValue = (value: unknown): string => {
	if (typeof value === 'string') return value;
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	if (Array.isArray(value)) return value.map(stringifyValue).join(', ');
	try {
		return JSON.stringify(value) ?? String(value);
	} catch {
		return String(value);
	}
};

const DETAIL_CSS = `
	body {
		margin: 0;
		padding: 20px;
		font-family: var(--vscode-font-family, system-ui, sans-serif);
		color: var(--vscode-foreground, #ddd);
		background: var(--vscode-editor-background, #1e1e1e);
	}
	.card {
		border: 1px solid var(--vscode-panel-border, #333);
		border-radius: 10px;
		padding: 14px 16px;
		margin-bottom: 14px;
		background: var(--vscode-editorWidget-background, rgba(255, 255, 255, 0.03));
	}
	h1 { font-size: 20px; margin: 0 0 10px; }
	h2 { font-size: 15px; margin: 0 0 10px; }
	dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 16px; margin: 0; }
	dt { color: var(--vscode-descriptionForeground, #999); }
	dd { margin: 0; }
	table { width: 100%; border-collapse: collapse; font-size: 13px; }
	th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a); vertical-align: top; }
	th { color: var(--vscode-descriptionForeground, #999); font-weight: 600; }
	table.kv td:first-child { width: 30%; white-space: nowrap; }
	.ts { white-space: nowrap; color: var(--vscode-descriptionForeground, #999); }
	code { font-family: var(--vscode-editor-font-family, monospace); }
	.muted { color: var(--vscode-descriptionForeground, #999); }
	.badge {
		display: inline-block;
		padding: 1px 8px;
		border-radius: 999px;
		font-size: 12px;
		border: 1px solid var(--vscode-panel-border, #444);
		vertical-align: middle;
	}
	.progress {
		position: relative;
		width: 100%;
		height: 22px;
		border-radius: 999px;
		background: var(--vscode-editorWidget-background, rgba(255,255,255,0.04));
		border: 1px solid var(--vscode-panel-border, #333);
		overflow: hidden;
		margin: 4px 0 12px;
	}
	.progress__bar {
		height: 100%;
		background: linear-gradient(
			90deg,
			var(--vscode-progressBar-background, #4ec9b0),
			#7dd3a7
		);
		transition: width 0.2s ease;
	}
	.progress__label {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		line-height: 22px;
		font-size: 12px;
		text-align: center;
		color: var(--vscode-editor-foreground, #ddd);
		mix-blend-mode: difference;
	}
	.agents {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.agents li {
		border: 1px solid var(--vscode-panel-border, #444);
		border-radius: 999px;
		padding: 2px 10px;
		font-size: 12px;
	}
	.plan {
		max-height: 360px;
		overflow: auto;
		background: var(--vscode-editor-background, rgba(0,0,0,0.2));
		border-radius: 8px;
		padding: 10px 14px;
		font-size: 13px;
	}
	.plan h1, .plan h2, .plan h3 {
		margin: 8px 0 4px;
	}
	.plan pre {
		background: var(--vscode-editorWidget-background, rgba(255,255,255,0.05));
		padding: 8px;
		border-radius: 6px;
		overflow-x: auto;
	}
`;
