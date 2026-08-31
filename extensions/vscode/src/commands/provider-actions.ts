/**
 * provider-actions.ts — f00098 S3.
 *
 * The provider dashboard's commands: open the panel, refresh the
 * healthcheck, pause/resume a provider (wrapping `set_provider_state`
 * with a recorded reason), open the usage report, and clear the usage
 * log behind a MODAL confirm (parity with the CLI's `--confirm`, f00098
 * non-goal: no unconfirmed destructive path).
 *
 * Thin host adapter: every payload is mapped by the host-agnostic
 * builders from `@mcp-vertex/ui-extension` (S1+S2); this module only
 * calls tools and repaints. When a plugin is absent the tool call fails
 * and the builder receives `undefined` → it returns the explicit
 * opt-in model, never an error state.
 *
 * Refresh model (f00098 non-goal: no polling): the panel repaints when
 * one of these commands runs — including `providers.healthcheck`, which
 * the global `mcp-vertex.refresh` can dispatch — never on a timer.
 */
import { formatToolName, type McpStdioClient } from '@mcp-vertex/client';
import {
	buildProviderStatusModel,
	buildModelAttributionModel,
	buildUsageCostModel,
	type IGetQuotaPayload,
	type IHealthcheckProvidersPayload,
	type ILimitsStatusPayload,
	type IModelAttributionReportPayload,
	type IUsageReportPayload,
} from '@mcp-vertex/ui-extension/public';

import type { IWebviewPanel } from '../extension';
import {
	providerDashboardStringsByLang,
	type IProviderDashboardStrings,
} from '../i18n/provider-dashboard.strings';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import {
	renderProviderDashboardHtml,
	type IProviderDashboardViewModel,
} from '../views/provider-dashboard-webview';
import type { ICommandDeps, ICommandVscodeApi } from './types';
import { showCommandError } from './types';
import { HOST_LANG_KEY } from './setup-github';

export const PROVIDERS_OPEN_DASHBOARD_COMMAND =
	'mcp-vertex.providers.openDashboard';
export const PROVIDERS_HEALTHCHECK_COMMAND = 'mcp-vertex.providers.healthcheck';
export const PROVIDERS_PAUSE_COMMAND = 'mcp-vertex.providers.pause';
export const PROVIDERS_RESUME_COMMAND = 'mcp-vertex.providers.resume';
export const USAGE_REPORT_COMMAND = 'mcp-vertex.usage.report';
export const USAGE_CLEAR_COMMAND = 'mcp-vertex.usage.clear';

/**
 * Solid-ISP: the two dialog capabilities this module needs beyond
 * `ICommandVscodeApi`. Optional so existing hosts/test fakes keep
 * compiling; when absent, pause/resume skip the reason and the clear
 * command refuses to run (no unconfirmed destructive path — parity
 * with the CLI `--confirm`).
 */
export interface IProviderActionsVscodeApi extends ICommandVscodeApi {
	readonly window: ICommandVscodeApi['window'] & {
		showInputBox?(options: {
			readonly prompt: string;
		}): Thenable<string | undefined>;
		/** `modal: true` is what makes usage_clear parity-safe. */
		showWarningMessage?(
			message: string,
			options: { readonly modal: boolean },
			...actions: readonly string[]
		): Thenable<string | undefined>;
	};
}

export interface IProviderActionsDeps extends Omit<ICommandDeps, 'vscode'> {
	readonly vscode: IProviderActionsVscodeApi;
}

const stringsFor = (deps: IProviderActionsDeps): IProviderDashboardStrings => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	const lang: Lang =
		typeof persisted === 'string' && persisted in dictsByLang
			? (persisted as Lang)
			: defaultLang;
	return providerDashboardStringsByLang[lang];
};

/** Call a namespaced tool; absent plugin (or any failure) → undefined. */
const tryTool = async <TOut>(
	client: McpStdioClient,
	prefix: string | undefined,
	suffix: string,
	args: object,
): Promise<TOut | undefined> => {
	try {
		return await client.request<object, TOut>(
			formatToolName(prefix, suffix),
			args,
		);
	} catch {
		return undefined;
	}
};

const fetchViewModel = async (
	deps: IProviderActionsDeps,
): Promise<IProviderDashboardViewModel> => {
	const { client, namespacePrefix: prefix } = deps;
	const [healthcheck, quota, report, modelReport, spend] = await Promise.all([
		tryTool<IHealthcheckProvidersPayload>(
			client,
			prefix,
			'orchestrator-runner_healthcheck_providers',
			{},
		),
		tryTool<IGetQuotaPayload>(
			client,
			prefix,
			'orchestrator-runner_get_quota',
			{},
		),
		tryTool<IUsageReportPayload>(
			client,
			prefix,
			'usage-tracking_usage_report',
			{
				groupBy: 'provider',
			},
		),
		tryTool<IModelAttributionReportPayload>(
			client,
			prefix,
			'usage-tracking_usage_report',
			{ groupBy: 'model', sortBy: 'tokensSaved' },
		),
		tryTool<{ readonly limitsStatus: ILimitsStatusPayload }>(
			client,
			prefix,
			'orchestrator-runner_advise_spend',
			{},
		),
	]);
	return {
		providers: buildProviderStatusModel(healthcheck, quota ?? null),
		usage: buildUsageCostModel(report, spend?.limitsStatus ?? null),
		modelAttribution: buildModelAttributionModel(modelReport),
	};
};

/**
 * The single open panel, module-scoped so every action command can
 * repaint it after a mutation instead of polling.
 */
let activePanel: IWebviewPanel | undefined;

const repaintIfOpen = async (deps: IProviderActionsDeps): Promise<void> => {
	if (activePanel === undefined) return;
	const model = await fetchViewModel(deps);
	activePanel.webview.html = renderProviderDashboardHtml(
		model,
		stringsFor(deps),
	);
};

export const registerProvidersOpenDashboardCommand = (
	deps: IProviderActionsDeps,
) =>
	deps.vscode.commands.registerCommand(
		PROVIDERS_OPEN_DASHBOARD_COMMAND,
		async () => {
			const s = stringsFor(deps);
			const panel = deps.vscode.window.createWebviewPanel(
				'mcpVertexProviderDashboard',
				s.title,
				deps.vscode.ViewColumn.One,
				{ enableScripts: false },
			);
			panel.webview.html = renderProviderDashboardHtml(
				{
					providers: buildProviderStatusModel(undefined, null),
					usage: buildUsageCostModel(undefined, null),
					modelAttribution: buildModelAttributionModel(undefined),
				},
				s,
			);
			activePanel = panel;
			panel.webview.onDidDispose?.(() => {
				if (activePanel === panel) activePanel = undefined;
			});
			try {
				const model = await fetchViewModel(deps);
				panel.webview.html = renderProviderDashboardHtml(model, s);
			} catch (err) {
				panel.webview.html = renderProviderDashboardHtml(
					{
						providers: buildProviderStatusModel(undefined, null),
						usage: buildUsageCostModel(undefined, null),
						modelAttribution: buildModelAttributionModel(undefined),
					},
					s,
				);
				await showCommandError(
					deps.vscode,
					'open provider dashboard',
					err,
				);
			}
		},
	);

export const registerProvidersHealthcheckCommand = (
	deps: IProviderActionsDeps,
) =>
	deps.vscode.commands.registerCommand(
		PROVIDERS_HEALTHCHECK_COMMAND,
		async () => {
			try {
				await deps.client.request(
					formatToolName(
						deps.namespacePrefix,
						'orchestrator-runner_healthcheck_providers',
					),
					{},
				);
				await repaintIfOpen(deps);
				await deps.vscode.window.showInformationMessage?.(
					`mcp-vertex: ${stringsFor(deps).healthcheckDone}`,
				);
			} catch (err) {
				await showCommandError(
					deps.vscode,
					'provider healthcheck',
					err,
				);
			}
		},
	);

const pickProviderId = async (
	deps: IProviderActionsDeps,
): Promise<string | undefined> => {
	const health = await tryTool<IHealthcheckProvidersPayload>(
		deps.client,
		deps.namespacePrefix,
		'orchestrator-runner_healthcheck_providers',
		{},
	);
	const rows = health?.providers ?? [];
	if (rows.length === 0 || deps.vscode.window.showQuickPick === undefined) {
		return deps.vscode.window.showInputBox?.({
			prompt: stringsFor(deps).pickProvider,
		});
	}
	const picked = await deps.vscode.window.showQuickPick(
		rows.map((row) => ({
			id: row.id,
			label: row.id,
			description: row.overall,
		})),
	);
	return picked?.id;
};

/**
 * Pause = manual availability override via `set_provider_state`. The
 * provider vocabulary has no dedicated `paused` state; `rate-limited`
 * is the deliberate choice: routing skips the provider, dashboards show
 * it amber (a chosen pause, not a red failure), and the reason is
 * recorded in the availability mirror.
 */
const setProviderState = async (
	deps: IProviderActionsDeps,
	state: 'rate-limited' | 'available',
	doneInfo: (s: IProviderDashboardStrings) => string,
): Promise<void> => {
	const providerId = await pickProviderId(deps);
	if (providerId === undefined || providerId.length === 0) return;
	const reason = await deps.vscode.window.showInputBox?.({
		prompt: stringsFor(deps).reasonPrompt,
	});
	await deps.client.request(
		formatToolName(
			deps.namespacePrefix,
			'orchestrator-runner_set_provider_state',
		),
		{
			providerId,
			state,
			...(reason === undefined || reason.length === 0 ? {} : { reason }),
		},
	);
	await repaintIfOpen(deps);
	await deps.vscode.window.showInformationMessage?.(
		`mcp-vertex: ${providerId} — ${doneInfo(stringsFor(deps))}`,
	);
};

export const registerProvidersPauseCommand = (deps: IProviderActionsDeps) =>
	deps.vscode.commands.registerCommand(PROVIDERS_PAUSE_COMMAND, async () => {
		try {
			await setProviderState(deps, 'rate-limited', (s) => s.pausedInfo);
		} catch (err) {
			await showCommandError(deps.vscode, 'pause provider', err);
		}
	});

export const registerProvidersResumeCommand = (deps: IProviderActionsDeps) =>
	deps.vscode.commands.registerCommand(PROVIDERS_RESUME_COMMAND, async () => {
		try {
			await setProviderState(deps, 'available', (s) => s.resumedInfo);
		} catch (err) {
			await showCommandError(deps.vscode, 'resume provider', err);
		}
	});

export const registerUsageReportCommand = (deps: IProviderActionsDeps) =>
	deps.vscode.commands.registerCommand(USAGE_REPORT_COMMAND, async () => {
		try {
			await deps.vscode.commands.executeCommand?.(
				PROVIDERS_OPEN_DASHBOARD_COMMAND,
			);
		} catch (err) {
			await showCommandError(deps.vscode, 'open usage report', err);
		}
	});

export const registerUsageClearCommand = (deps: IProviderActionsDeps) =>
	deps.vscode.commands.registerCommand(USAGE_CLEAR_COMMAND, async () => {
		try {
			const s = stringsFor(deps);
			// MODAL confirm or nothing — a host without the modal dialog
			// capability gets no destructive path (CLI --confirm parity).
			const choice = await deps.vscode.window.showWarningMessage?.(
				s.clearConfirm,
				{ modal: true },
				s.clearConfirmYes,
			);
			if (choice !== s.clearConfirmYes) return;
			await deps.client.request(
				formatToolName(
					deps.namespacePrefix,
					'usage-tracking_usage_clear',
				),
				{ confirm: true },
			);
			await repaintIfOpen(deps);
			await deps.vscode.window.showInformationMessage?.(
				`mcp-vertex: ${s.clearedInfo}`,
			);
		} catch (err) {
			await showCommandError(deps.vscode, 'clear usage log', err);
		}
	});

/** Convenience: register the whole provider-actions command set. */
export const registerProviderActionCommands = (
	deps: IProviderActionsDeps,
): readonly { dispose(): void }[] => [
	registerProvidersOpenDashboardCommand(deps),
	registerProvidersHealthcheckCommand(deps),
	registerProvidersPauseCommand(deps),
	registerProvidersResumeCommand(deps),
	registerUsageReportCommand(deps),
	registerUsageClearCommand(deps),
];
