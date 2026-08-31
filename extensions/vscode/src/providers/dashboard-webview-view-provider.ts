import {
	DashboardService,
	EmbedService,
	type McpStdioClient,
} from '@mcp-vertex/client';
import { defaultLang, dictsByLang, type Lang } from '../i18n';
import {
	renderDashboard,
	type IHostAdapter,
	type IWebviewPanel,
} from '@mcp-vertex/ui-extension/public';
import { DASHBOARD_MESSAGE_SCHEMA } from '../contracts/constants/dashboard-message-schema.constant';
import { OPEN_PROPOSAL_COMMAND } from '../commands/open-proposal';
import { OPEN_TOOL_DETAIL_COMMAND } from '../contracts/constants/open-tool-detail-command.constant';
import { OPEN_KNOWLEDGE_COMMAND } from '../commands/open-knowledge';
import { OPEN_SETTINGS_COMMAND } from '../commands/open-settings';
import { OPEN_CONFIGURATION_CENTER_COMMAND } from '../commands/open-configuration-center';
import { OPEN_DOCS_COMMAND } from '../commands/open-docs';
import { REFRESH_COMMAND } from '../commands/refresh';
import { HOST_LANG_KEY } from '../commands/setup-github';

export interface IDashboardWebviewViewProviderDeps {
	readonly host: IHostAdapter;
	readonly client: McpStdioClient;
	readonly globalState?: {
		get<T>(key: string): T | undefined;
	};
	readonly getConfig: () => {
		readonly extension?: { readonly docsUrl?: string };
	};
	readonly namespacePrefix?: string;
}

const resolveLang = (deps: IDashboardWebviewViewProviderDeps): Lang => {
	const persisted = deps.globalState?.get<unknown>(HOST_LANG_KEY);
	return typeof persisted === 'string' && persisted in dictsByLang
		? (persisted as Lang)
		: defaultLang;
};

const resolveDocsUrl = (
	getConfig: IDashboardWebviewViewProviderDeps['getConfig'],
): string => {
	try {
		return new EmbedService().resolve(getConfig()).url;
	} catch {
		return 'https://mcp-vertex.dev';
	}
};

export class DashboardWebviewViewProvider {
	private view: IWebviewPanel | undefined;
	private refreshToken = 0;

	constructor(private readonly deps: IDashboardWebviewViewProviderDeps) {}

	async resolveWebviewView(view: IWebviewPanel): Promise<void> {
		this.view = view;
		view.onDidDispose(() => {
			if (this.view === view) this.view = undefined;
		});
		view.webview.onDidReceiveMessage?.((message: unknown) =>
			this.handleMessage(message),
		);
		await this.refresh();
	}

	async refresh(): Promise<void> {
		const view = this.view;
		if (view === undefined) return;
		const token = ++this.refreshToken;
		const dashboard = new DashboardService({
			client: this.deps.client,
			...(this.deps.namespacePrefix === undefined
				? {}
				: { namespacePrefix: this.deps.namespacePrefix }),
		});
		const models = await dashboard.getAllModels();
		if (token !== this.refreshToken || this.view !== view) return;
		const lang = resolveLang(this.deps);
		view.webview.setHtml(
			renderDashboard(models, {
				docsUrl: resolveDocsUrl(this.deps.getConfig),
				refreshCommand: REFRESH_COMMAND,
				openDocsCommand: OPEN_DOCS_COMMAND,
				lang: dictsByLang[lang],
			}),
		);
	}

	private async handleMessage(message: unknown): Promise<void> {
		const parsed = DASHBOARD_MESSAGE_SCHEMA.safeParse(message);
		if (!parsed.success) return;
		if (parsed.data.command === 'action') {
			await this.deps.host.executeCommand?.(REFRESH_COMMAND);
			return;
		}
		if (parsed.data.command === 'openTool') {
			await this.deps.host.executeCommand?.(
				OPEN_TOOL_DETAIL_COMMAND,
				parsed.data.name,
			);
			return;
		}
		if (parsed.data.command === 'openSurface') {
			const commands = {
				proposals: OPEN_PROPOSAL_COMMAND,
				knowledge: OPEN_KNOWLEDGE_COMMAND,
				configuration: OPEN_CONFIGURATION_CENTER_COMMAND,
				settings: OPEN_SETTINGS_COMMAND,
			} as const;
			await this.deps.host.executeCommand?.(
				commands[parsed.data.surface],
			);
			return;
		}
		await this.deps.host.executeCommand?.(
			OPEN_PROPOSAL_COMMAND,
			parsed.data.id,
		);
	}
}
