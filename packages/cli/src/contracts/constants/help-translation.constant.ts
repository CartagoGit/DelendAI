export interface IHelpTranslation {
	readonly usage: string;
	readonly globalFlags: string;
	readonly commands: string;
	readonly flagWorkspace: string;
	readonly flagRemote: string;
	readonly flagPlugins: string;
	readonly flagPreset: string;
	readonly flagConfig: string;
	readonly flagJson: string;
	readonly flagHelp: string;
	readonly flagVersion: string;
	readonly commandSummaries: Readonly<Record<string, string>>;
}

const ENGLISH_COMMAND_SUMMARIES: Readonly<Record<string, string>> = {
	status: 'Show runtime status collectors.',
	overview: 'Show loaded server map.',
	'plugin list': 'List loaded plugins.',
	'plugin inspect': 'Inspect one plugin and its tools.',
	metrics: 'Show per-tool metrics.',
	'validate-matrix': 'Show configured validation matrix.',
	validate: 'Run the root validation gate.',
	'config schema': 'Regenerate and show config JSON schema.',
	'config show': 'Show active config file.',
	'config get': 'Read one config dot path.',
	'config doctor': 'Diagnose the config file.',
	'config set': 'Safely set one config dot path.',
	init: 'Create a minimal mcp-vertex config file.',
	search: 'Search workspace text files.',
	'docs list': 'List project documentation.',
	'docs read': 'Read one project documentation file.',
	scaffold: 'Generate a scaffold through the core tool.',
};

export const HELP_TRANSLATIONS: Readonly<Record<string, IHelpTranslation>> = {
	en: {
		usage: 'Usage:',
		globalFlags: 'Global flags:',
		commands: 'Commands:',
		flagWorkspace: 'Workspace root (default: current directory)',
		flagRemote: 'Use stdio transport (tcp:// is reserved for v2)',
		flagPlugins: 'Extra plugins to load into the MCP server',
		flagPreset: 'Core plugin preset passed to the MCP server',
		flagConfig: 'Config file passed to the MCP server',
		flagJson: 'Print stable JSON',
		flagHelp: 'Show help',
		flagVersion: 'Show version',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
	},
	es: {
		usage: 'Uso:',
		globalFlags: 'Opciones globales:',
		commands: 'Comandos:',
		flagWorkspace: 'Raiz del workspace (por defecto: directorio actual)',
		flagRemote: 'Usa transporte stdio (tcp:// queda reservado para v2)',
		flagPlugins: 'Plugins extra que cargar en el servidor MCP',
		flagPreset: 'Preset de plugins del core para el servidor MCP',
		flagConfig: 'Archivo de configuracion para el servidor MCP',
		flagJson: 'Imprime JSON estable',
		flagHelp: 'Muestra ayuda',
		flagVersion: 'Muestra la version',
		commandSummaries: {
			...ENGLISH_COMMAND_SUMMARIES,
			status: 'Muestra los colectores de estado en runtime.',
			overview: 'Muestra el mapa del servidor cargado.',
			'plugin list': 'Lista los plugins cargados.',
			'config doctor': 'Diagnostica el archivo de configuracion.',
			init: 'Crea un mcp-vertex.config.json minimo.',
			search: 'Busca en archivos de texto del workspace.',
			scaffold: 'Genera scaffolds a traves de la herramienta del core.',
		},
	},
	ja: {
		usage: '使い方:',
		globalFlags: 'グローバルフラグ:',
		commands: 'コマンド:',
		flagWorkspace: 'ワークスペースルート (既定: 現在のディレクトリ)',
		flagRemote: 'stdio トランスポートを使う (tcp:// は v2 予定)',
		flagPlugins: 'MCP サーバーに追加で読み込むプラグイン',
		flagPreset: 'MCP サーバーへ渡す core プリセット',
		flagConfig: 'MCP サーバーへ渡す設定ファイル',
		flagJson: '安定した JSON を出力',
		flagHelp: 'ヘルプを表示',
		flagVersion: 'バージョンを表示',
		commandSummaries: {
			...ENGLISH_COMMAND_SUMMARIES,
			status: '実行時ステータスコレクタを表示します。',
			overview: '読み込まれたサーバーマップを表示します。',
			'plugin list': '読み込まれたプラグインを一覧します。',
			'config doctor': '設定ファイルを診断します。',
			init: '最小の mcp-vertex.config.json を作成します。',
			search: 'ワークスペースのテキストファイルを検索します。',
			scaffold: 'core ツール経由で scaffold を生成します。',
		},
	},
};

export const SUPPORTED_HELP_LANGS = [
	'ar',
	'de',
	'en',
	'es',
	'fr',
	'hi',
	'it',
	'ja',
	'pt',
	'th',
	'vi',
	'zh',
] as const;

export const helpTranslationFor = (lang: string): IHelpTranslation => {
	const english = HELP_TRANSLATIONS.en;
	if (english === undefined) {
		throw new Error('English CLI help translation is missing');
	}
	return HELP_TRANSLATIONS[lang] ?? english;
};
