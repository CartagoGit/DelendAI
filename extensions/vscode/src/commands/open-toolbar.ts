/**
 * `mcp-vertex.openToolbar` — opens the in-extension toolbar
 * webview. The toolbar is a 3-column grid of action cards grouped
 * by category, rendered by
 * `@mcp-vertex/ui-extension/public`'s `renderToolbar(...)`.
 *
 * The toolbar is the user's one-click entry point to the repo's
 * most useful actions: proposals board, knowledge navigator,
 * today's log, docs, validation, git status, memory, etc. Each
 * card dispatches a `mcp-vertex.*` command via the existing
 * command palette; the toolbar is pure UI over those commands,
 * no new domain logic.
 */
import { OverviewService } from '@mcp-vertex/client';
import { dictsByLang, defaultLang, type Lang } from '@mcp-vertex/shared/i18n';
import {
	defaultQuickActions,
	renderToolbar,
} from '@mcp-vertex/ui-extension/public';

import { HOST_LANG_KEY } from './setup-github';
import type { ICommandDeps } from './types';

export const OPEN_TOOLBAR_COMMAND = 'mcp-vertex.openToolbar';

/**
 * f00079 S2 (closes a00040 H3): allow-list of command ids the toolbar
 * webview may dispatch. The toolbar's host bridge posts an arbitrary
 * `{ command: 'mvAction', action, commandId }` message; without this
 * gate a crafted message (XSS or confused-deputy) could run ANY
 * `vscode.commands.executeCommand(...)` with arbitrary arguments. We
 * derive the set from the toolbar's own canonical action catalog
 * (`defaultQuickActions`) so security review is a single `grep` and the
 * allow-list cannot drift from the rendered cards. The two language
 * persistence commands the bridge also emits are NOT executeCommand
 * dispatches, so they are intentionally absent here.
 */
export const ALLOWED_TOOLBAR_COMMANDS: ReadonlySet<string> = new Set(
	defaultQuickActions().map((action) => action.command),
);

/**
 * Resolve the canonical command id the toolbar message wants to run.
 * Prefers the renderer-embedded `commandId`; falls back to deriving
 * `mcp-vertex.<action>` from the raw action id (legacy bridges). Returns
 * `undefined` when neither yields a usable string.
 */
export const resolveToolbarCommandId = (
	commandId: unknown,
	action: unknown,
): string | undefined => {
	if (typeof commandId === 'string' && commandId.length > 0) return commandId;
	if (typeof action === 'string' && action.length > 0) {
		return `mcp-vertex.${action.replace(/\./g, '_')}`;
	}
	return undefined;
};

const TOOLBAR_VIEW_TYPE = 'mcpVertexToolbar';
const TOOLBAR_TITLE = 'mcp-vertex Toolbar';

/** Resolve the host's persisted language (f00050 S7) with a typed fallback. */
const resolveLang = (deps: ICommandDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

/**
 * Pull the live server version from the OverviewService so the
 * toolbar's header reflects the running MCP server (FIX T2). The
 * previous implementation hardcoded `'1.0.0'`, which never
 * matched reality and gave the user no feedback about whether
 * the server was actually running. If the Overview call fails
 * (e.g. server not yet booted) we fall back to the extension's
 * own package version so the header still renders something
 * useful.
 */
const resolveVersion = async (deps: ICommandDeps): Promise<string> => {
	try {
		const overview = new OverviewService(deps.client);
		const snap = await overview.getOverview({ compact: true });
		const v = (snap as { server?: { version?: string } })?.server?.version;
		if (typeof v === 'string' && v.length > 0) return v;
	} catch {
		// ignore; fall through to fallback
	}
	return '0.0.0-local';
};

export const registerOpenToolbarCommand = (deps: ICommandDeps) =>
	deps.vscode.commands.registerCommand(OPEN_TOOLBAR_COMMAND, async () => {
		const lang = resolveLang(deps);
		const dict = dictsByLang[lang];
		const version = await resolveVersion(deps);
		const html = renderToolbar({
			host: 'vscode',
			lang: dict,
			version,
			// f00059 S3: pull the live loaded-plugin set from deps so the
			// toolbar drops action cards whose `requires` is unmet. When
			// the host has not populated the bag (legacy / older build)
			// the toolbar falls back to "show everything" — the runtime
			// surfaces a toast on the missing command.
			loadedPlugins: deps.loadedPlugins ?? [],
		});
		const panel = deps.vscode.window.createWebviewPanel(
			TOOLBAR_VIEW_TYPE,
			TOOLBAR_TITLE,
			deps.vscode.ViewColumn.One,
			{ enableScripts: true },
		);
		panel.webview.html = html;
		// FIX (T1): wire the host bridge so toolbar card clicks
		// dispatch their `data-mv-command`. The toolbar's
		// `renderHostBridge()` script posts
		// `{command:'mvAction', action, commandId}`. We prefer the
		// commandId embedded by the renderer (it's the canonical
		// `mcp-vertex.*` command id) and fall back to a generic
		// execution of the action id when missing. Without this
		// listener the runtime's fallback host swallowed every
		// click as a silent no-op.
		panel.webview.onDidReceiveMessage?.(async (msg: unknown) => {
			if (typeof msg !== 'object' || msg === null) return;
			const m = msg as {
				command?: unknown;
				action?: unknown;
				commandId?: unknown;
				lang?: unknown;
			};
			if (m.command === 'mvAction') {
				const commandId = resolveToolbarCommandId(
					m.commandId,
					m.action,
				);
				if (commandId === undefined) return;
				// f00079 S2 (a00040 H3): refuse to dispatch any command id
				// outside the toolbar's own canonical allow-list. A crafted
				// webview message can name an arbitrary command (e.g.
				// `workbench.action.*`); we surface it as a typed error toast
				// instead of executing it.
				if (!ALLOWED_TOOLBAR_COMMANDS.has(commandId)) {
					await deps.vscode.window.showErrorMessage?.(
						`mcp-vertex: toolbar action "${commandId}" is not allowed.`,
					);
					return;
				}
				try {
					await deps.vscode.commands.executeCommand?.(commandId);
				} catch (err) {
					await deps.vscode.window.showErrorMessage?.(
						`mcp-vertex: toolbar action "${commandId}" failed: ${
							err instanceof Error ? err.message : String(err)
						}`,
					);
				}
				return;
			}
			if (
				(m.command === 'setLanguage' ||
					m.command === 'persistLanguage') &&
				typeof m.lang === 'string'
			) {
				await deps.globalState?.update?.(HOST_LANG_KEY, m.lang);
			}
		});
		return panel;
	});
