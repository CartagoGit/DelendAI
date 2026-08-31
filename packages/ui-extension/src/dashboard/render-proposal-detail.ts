/**
 * `renderProposalDetailHtml` / `renderProposalDetailBody` — the
 * host-agnostic HTML for the read-only proposal detail view
 * (header / progress / agents / plan / slices / diagnose / logs).
 *
 * The renderer consumes `IProposalDetail` + `IProposalDetailCopy`,
 * both defined in `../contracts/interfaces/proposal-detail.interface`,
 * so any host (VS Code, JetBrains, Zed, the docs site preview) can
 * project the same view without depending on the extension's
 * snapshot layer or its internal `IViewCopy`.
 */
import { DEFAULT_DENY, injectCspMeta } from '../webview/csp';
import type {
	IProposalDetail,
	IProposalDetailCopy,
} from '../contracts/interfaces/proposal-detail.interface';
import { escapeHtml } from './render-output-schema';

export const DEFAULT_PROPOSAL_DETAIL_COPY: IProposalDetailCopy = {
	lang: 'en',
	folder: 'Folder',
	slices: 'Slices',
	slice: 'Slice',
	status: 'Status',
	owner: 'Owner',
	claimableNow: 'claimable now',
	lockOwners: 'Lock owners',
	notActionable:
		'This proposal is not on the actionable board, so per-slice status is not available here.',
	noSlices: 'No slices.',
	diagnose: 'Diagnose',
	noDiagnosis: 'No diagnosis available.',
	emptyDiagnosis: 'Empty diagnosis.',
	logs: 'Logs',
	noLogs: 'No matching log lines.',
	time: 'Time',
	kind: 'Kind',
	agent: 'Agent',
	summary: 'Summary',
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

const badge = (status: string): string =>
	`<span class="badge badge--${escapeHtml(
		status.replace(/[^a-z0-9]+/gi, '-').toLowerCase(),
	)}">${escapeHtml(status)}</span>`;

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

const progressBar = (percent: number): string => {
	const safe = Math.max(0, Math.min(100, percent));
	return `<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${safe}">
		<div class="progress__bar" style="width:${safe}%"></div>
		<span class="progress__label">${safe}%</span>
	</div>`;
};

const headerCard = (
	detail: IProposalDetail,
	copy: IProposalDetailCopy,
): string => {
	const status =
		detail.summary?.status ?? asText(detail.diagnose?.status) ?? '—';
	const folder = asText(detail.diagnose?.folder);
	const owners = Array.isArray(detail.diagnose?.lockOwners)
		? (
				detail.diagnose as { lockOwners: readonly unknown[] }
			).lockOwners.filter((o): o is string => typeof o === 'string')
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

const progressCard = (
	detail: IProposalDetail,
	copy: IProposalDetailCopy,
): string => {
	const progress = detail.progress;
	const etaText =
		progress.etaLabel === undefined
			? detail.summary === undefined
				? '—'
				: 'not enough history yet'
			: progress.etaLabel;
	const etaIso = progress.eta ?? '—';
	return `<section class="card">
		<h2>${escapeHtml(copy.progress)}</h2>
		${progressBar(progress.percent)}
		<dl>
			<dt>${escapeHtml(copy.done)}</dt><dd>${progress.done} / ${progress.total} ${escapeHtml(copy.slicesWord)}</dd>
			<dt>${escapeHtml(copy.inProgress)}</dt><dd>${progress.inProgress}</dd>
			<dt>${escapeHtml(copy.pending)}</dt><dd>${progress.pending}</dd>
			<dt>${escapeHtml(copy.etaShort)}</dt><dd>${escapeHtml(etaText)} <span class="muted">(${escapeHtml(etaIso)})</span></dd>
		</dl>
	</section>`;
};

const agentsCard = (
	detail: IProposalDetail,
	copy: IProposalDetailCopy,
): string => {
	const agents = detail.agents ?? [];
	if (agents.length === 0) {
		return `<section class="card">
			<h2>${escapeHtml(copy.agents)} (0)</h2>
			<p class="muted">${escapeHtml(copy.noAgents)}</p>
		</section>`;
	}
	const rows = agents
		.map(
			(agent: IProposalDetail['agents'][number]) =>
				`<li><strong>${escapeHtml(agent.name)}</strong>${
					agent.taskId === null
						? ''
						: ` <span class="muted">on ${escapeHtml(agent.taskId)}</span>`
				}</li>`,
		)
		.join('');
	return `<section class="card">
		<h2>${escapeHtml(copy.agents)} (${agents.length})</h2>
		<ul class="agents">${rows}</ul>
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

const planCard = (
	detail: IProposalDetail,
	copy: IProposalDetailCopy,
): string => {
	if (detail.planMarkdown === undefined || detail.planMarkdown.length === 0) {
		return `<section class="card">
			<h2>${escapeHtml(copy.plan)}</h2>
			<p class="muted">${escapeHtml(copy.noPlan)}</p>
		</section>`;
	}
	const html = renderMarkdownSafe(detail.planMarkdown);
	return `<section class="card">
		<h2>${escapeHtml(copy.plan)}</h2>
		<article class="plan">${html}</article>
	</section>`;
};

const slicesCard = (
	detail: IProposalDetail,
	copy: IProposalDetailCopy,
): string => {
	const slices = detail.summary?.slices ?? [];
	if (detail.summary === undefined) {
		return `<section class="card"><h2>${escapeHtml(copy.slices)}</h2><p class="muted">${escapeHtml(copy.notActionable)}</p></section>`;
	}
	const rows = slices
		.map(
			(
				s: IProposalDetail['summary'] extends infer S
					? S extends { slices: readonly (infer Item)[] }
						? Item
						: never
					: never,
			) => `<tr>
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

const diagnoseCard = (
	detail: IProposalDetail,
	copy: IProposalDetailCopy,
): string => {
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
		${
			rows === ''
				? `<p class="muted">${escapeHtml(copy.emptyDiagnosis)}</p>`
				: `<table class="kv"><tbody>${rows}</tbody></table>`
		}
	</section>`;
};

const logsCard = (
	detail: IProposalDetail,
	copy: IProposalDetailCopy,
): string => {
	if (detail.logs.length === 0) {
		return `<section class="card"><h2>${escapeHtml(copy.logs)}</h2><p class="muted">${escapeHtml(copy.noLogs)}</p></section>`;
	}
	const rows = detail.logs
		.map(
			(e: IProposalDetail['logs'][number]) => `<tr>
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

const renderCards = (
	detail: IProposalDetail,
	copy: IProposalDetailCopy,
): string =>
	[
		headerCard(detail, copy),
		progressCard(detail, copy),
		agentsCard(detail, copy),
		planCard(detail, copy),
		slicesCard(detail, copy),
		diagnoseCard(detail, copy),
		logsCard(detail, copy),
	].join('');

/**
 * Full standalone HTML mode — emit an entire `<!DOCTYPE html>`
 * document with CSP, inline styles, and the seven proposal cards.
 * Use this when the renderer is the only content of a webview panel.
 */
export const renderProposalDetailHtml = (
	detail: IProposalDetail,
	copyOverride?: IProposalDetailCopy,
): string => {
	const copy = copyOverride ?? DEFAULT_PROPOSAL_DETAIL_COPY;
	return injectCspMeta(
		`<!DOCTYPE html>
<html lang="${escapeHtml(copy.lang)}">
<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1.0" />
	<title>${escapeHtml(detail.id)}</title>
	<style>${DETAIL_CSS}</style>
</head>
<body>
	${renderCards(detail, copy)}
</body>
</html>`,
		DEFAULT_DENY,
	);
};

/**
 * `renderProposalDetailBody` — emit just the seven proposal cards
 * (no `<html>` wrapper) so a host shell can mount it inside its own
 * `<main>` without parsing `<html>` inside `<html>`. The host's CSS
 * provides the `card`/`progress`/`agents`/`plan` rules.
 */
export const renderProposalDetailBody = (
	detail: IProposalDetail,
	copyOverride?: IProposalDetailCopy,
): string => {
	const copy = copyOverride ?? DEFAULT_PROPOSAL_DETAIL_COPY;
	return renderCards(detail, copy);
};
