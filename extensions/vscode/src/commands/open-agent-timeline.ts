/**
 * `registerOpenAgentTimelineCommand` — opens (or refreshes) the
 * `mcp-vertex Agent Timeline` webview. The view renders an
 * append-only log of agent lifecycle events (`claim`, `activate`,
 * `change`, `test`, `cost`, `commit`, `close`) from a JSON file
 * persisted by the core's `TimelineBuffer`.
 *
 * Source of truth: `packages/core/src/lib/observability/timeline.ts`
 * (f00192). The branch's S1 scope is the view + the underlying
 * pure buffer; the host adapter that writes
 * `.vscode/mcp-vertex/timeline.json` lives in a follow-up slice.
 * Until that lands the command surfaces an empty-state log so the
 * view is exercisable end-to-end (CI gallery + manual smoke).
 *
 * Filtering happens via the query string (`?plugin=…&kind=…`); no
 * inline JS, no CSP widening — the form posts back via GET.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { ITimelineLog, TimelineEventKind } from '@delendai/core/public';
import { TimelineBuffer, isTimelineLog } from '@delendai/core/public';

import type { ICommandVscodeApi } from './types';
import { resolveViewLang, viewCopyFor } from '../i18n/view-copy.strings';
import type { IViewCopy } from '../contracts/interfaces/view-copy.interface';

import {
	parseTimelineQuery,
	projectTimelineView,
	renderAgentTimeline,
} from '../views/agent-timeline';

export const OPEN_AGENT_TIMELINE_COMMAND = 'mcp-vertex.openAgentTimeline';

/** Default on-disk location for the timeline JSON. Hosts MAY
 *  override via `IHostAdapter.state.get('timeline.path')`. */
export const DEFAULT_TIMELINE_PATH = '.vscode/mcp-vertex/timeline.json';

export interface IOpenAgentTimelineDeps {
	readonly vscode: ICommandVscodeApi;
	/** Absolute path to the workspace root; the timeline lives at
	 *  `<root>/.vscode/mcp-vertex/timeline.json` by default. */
	readonly workspaceRoot: string | null;
	readonly globalState?: {
		get<T>(key: string): T | undefined;
	};
}

/**
 * Load the timeline JSON from disk. Returns an empty log when the
 * file does not exist or fails to parse — the view degrades
 * gracefully instead of erroring on a fresh workspace.
 */
export const loadTimelineLog = (workspaceRoot: string | null): ITimelineLog => {
	if (workspaceRoot === null) return emptyLog();
	const path = join(workspaceRoot, DEFAULT_TIMELINE_PATH);
	if (!existsSync(path)) return emptyLog();
	try {
		const raw = readFileSync(path, 'utf8');
		const parsed = TimelineBuffer.deserialize(raw);
		if (!isTimelineLog(parsed)) return emptyLog();
		return parsed;
	} catch {
		return emptyLog();
	}
};

const emptyLog = (): ITimelineLog => ({ version: 1, events: [] });

/**
 * Render the timeline webview for the given filters. Pure:
 * `loadTimelineLog` is the only I/O and it's already resolved by
 * the caller. The command wires the parser → projection → render
 * pipeline and feeds the result to `vscode.window.createWebviewPanel`.
 */
export const renderTimelineForFilters = (
	log: ITimelineLog,
	filters: {
		readonly kind?: TimelineEventKind | null;
		readonly plugin?: string | null;
	},
	copy: IViewCopy = viewCopyFor('en'),
): string => {
	const model = projectTimelineView(log, filters);
	return renderAgentTimeline(model, { refreshHref: '?', copy });
};

export const registerOpenAgentTimelineCommand = (
	deps: IOpenAgentTimelineDeps,
) =>
	deps.vscode.commands.registerCommand(
		OPEN_AGENT_TIMELINE_COMMAND,
		async () => {
			const copy = viewCopyFor(
				resolveViewLang(deps.globalState?.get<unknown>('mcpv:lang')),
			);
			const log = loadTimelineLog(deps.workspaceRoot);
			const model = projectTimelineView(log, {
				kind: null,
				plugin: null,
			});
			const html = renderAgentTimeline(model, { refreshHref: '?', copy });
			// `vscode.window.createWebviewPanel` is the standard seam
			// used by every other command. The view is fully static —
			// no scripts, strict CSP — so we explicitly disable scripting.
			const panel = deps.vscode.window.createWebviewPanel(
				'mcp-vertex.agent-timeline',
				copy.timelineTitle,
				1,
				{
					enableScripts: false,
				},
			);
			// The webview surface receives the rendered HTML. Hosts
			// without a writable webview surface fall through silently;
			// the dev preview mounts the same body via
			// `renderAgentTimelineBody` (no double `<html>` parse).
			const writeable = panel as {
				readonly webview?: { readonly html: string };
			};
			if (writeable.webview !== undefined) {
				(writeable.webview as { html: string }).html = html;
			}
		},
	);

// Re-export so existing imports keep working (the proposal file
// referenced `parseTimelineQuery` from this module).
export { parseTimelineQuery };
