export interface IHelpTranslation {
	readonly usage: string;
	readonly globalFlags: string;
	readonly commands: string;
	readonly flagWorkspace: string;
	readonly flagRemote: string;
	readonly flagPlugins: string;
	readonly flagPreset: string;
	readonly flagConfig: string;
	readonly flagAgentWorktree: string;
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
	'git status': 'Working-tree status (branch + clean flag + entries).',
	'git changed': 'List of changed file paths in the working tree.',
	'git diff': 'Diff --stat (optionally staged or scoped to a path).',
	'git log': 'Recent commits (hash + subject).',
	'git blame':
		'Per-line authorship for a tracked file (optionally a line range).',
	'git show': 'Commit metadata + --stat summary for a ref (no full patch).',
	'git worktree': 'List existing git worktrees for this repo (read-only).',
	'memory save': 'Save a durable note (upserts by title).',
	'memory recall': 'Recall durable notes by query and/or tags.',
	'memory list': 'List durable notes as a cheap index (id, title, tags).',
	'memory forget': 'Delete a durable note by id.',
	'memory export': 'Export the note store as a portable snapshot.',
	'memory import': 'Import a snapshot produced by memory export.',
	'deps list': 'List declared npm dependencies with their version ranges.',
	'deps check':
		'Report offline dependency health (lockfile, unpinned, duplicates).',
	'deps polyglot':
		'List declared deps from pyproject/Cargo/go.mod (non-npm ecosystems).',
	'rules get': 'Show the lint/type rules map (optionally for one area).',
	'rules check':
		'Show how to check an area against its rules (resolved configs + command).',
	'rules apply':
		'Show a plan to bring an area into rule compliance (advisory).',
	'test-convention get':
		'Show the canonical test convention the workspace expects.',
	'test-convention suggest':
		'Show the companion spec path + skeleton for a source file.',
	'test-convention scan':
		'Scan src/ and tests/ for test-convention violations.',
	'quality scopes':
		'List the quality-gate scopes and the commands each runs.',
	'quality run': "Execute a quality scope's commands and report pass/fail.",
	'quality cancel': 'Abort quality commands currently running in the server.',
	'quality run-all':
		'Run every configured quality scope and aggregate the report.',
	'audit plan':
		'Get the canonical audit brief for a scope (paste into a model).',
	'audit consolidate':
		'Deduplicate + average audit reports into one master document.',
	'logs query':
		'Query redacted MCP log events with filters + cursor pagination.',
	'logs tail': 'Show the newest redacted MCP log events.',
	'logs subscribe':
		'Return recent log events matching outcome/kind filters (poll).',
	'logs correlate':
		'Build a chronological chain for one taskId or agent (gap detection).',
	'logs redact-test':
		'Run the redactor against a sample and list detected secret patterns.',
	'fs read': 'Read a workspace file (optionally a line range).',
	'fs write':
		'Write a workspace file (atomic by default, never outside the root).',
	knowledge: 'List knowledge entries, or print one by id.',
	'project analyze':
		'Inspect the project and recommend an MCP server plan (read-only).',
	'project plan':
		'Return an exhaustive blueprint for a project-specific MCP server.',
	'project create':
		'Generate the files for a project MCP server, plugin, or client.',
	'docs search': 'Search project documentation by free text (ranked hits).',
	'proposals auto-work':
		'Resolve the next proposal and return a compact action plan.',
	'proposals continue': 'Resolve / plan / claim the next proposal slice.',
	'proposals create':
		'Create a proposal document with a parseable Slices section.',
	'proposals close-slice':
		'Mark a slice done + release its lock atomically, then re-sync.',
	'proposals transition':
		'Move a proposal to a new status (DFA-validated; requires reason).',
	'proposals board':
		'Show each actionable proposal with its slices (verbose).',
	'proposals status':
		'Compact proposals state: locks, queue backpressure, counts.',
	'proposals health':
		'Diagnose swarm state (locks, queue, registry) without changing it.',
	'proposals agent-names':
		'Agent name registry: assign/release/list/tree/gc/reconcile.',
	'proposals lock': 'File write-ownership lock: claim/release/status/gc.',
	'proposals worktree':
		'Per-agent git worktree: create/list/remove (git isolation).',
	'proposals stale-list': 'List proposals whose owner emitted agent-dead.',
	'proposals round-context':
		'Return the persisted multi-agent round context (+ staleness).',
	'proposals workflow':
		'Return the proposal workflow (families, locations, template).',
	'proposals diagnose':
		'Diagnose a proposal: folder, status, lock owners, recovery.',
	'proposals adopt': 'Make a proposals folder followable (read-only plan).',
	'proposals force-transition':
		'Force a proposal to a recovery status (requires reason).',
	'proposals reconcile-folder':
		'Move a proposal file to the folder matching its status.',
	'proposals state-repair':
		'Auto-heal stale swarm state (dry-run unless --execute).',
	'proposals release-orphan':
		'Release an orphan task lock (only with an agent-dead event).',
	'proposals review':
		'Peer-review a slice: submit/approve/request_changes/status.',
	'proposals sync': 'Regenerate the proposal index from the proposals tree.',
	'proposals task-queue':
		'Swarm coordination queue: enqueue/dequeue/subscribe/report.',
	'proposals delegate':
		'Delegate a slice to a subagent (assign name + claim files).',
	'proposals plan':
		'Validate proposed slices into a parallel plan (disjointness).',
	'notification status':
		'Report the lock-release notifier (watched file + recent releases).',
	'notification await-lock':
		'Block until a taskId lock is released (or timeout), then return.',
	'web-fetch': 'Fetch one allow-listed URL and return capped text (opt-in).',
	'status-marker close':
		'Return the exact coloured close-marker line for a state.',
	'status-marker validate':
		'Check whether a response ends with a valid close marker.',
	'status-marker ping':
		'Echo plugin identity + resolved paths (confirm it is loaded).',
	'conventions check':
		'Report file-convention drift (per-role counts + unmatched files).',
	'conventions plan':
		'List the files that need a canonical rename (migration backlog).',
	'conventions apply':
		'Guarded apply: reports outstanding violations (no blind rename).',
	doctor: 'Sectioned health report (env, config, plugins, tools) + exit code.',
	completion: 'Print a shell-completion script (bash|zsh|fish) for mcpv.',
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
		flagAgentWorktree:
			'Enable per-agent git worktrees (host-scoped; default off)',
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
		flagAgentWorktree:
			'Habilita worktrees git por agente (a nivel host; por defecto off)',
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
	ar: {
		usage: 'الاستخدام:',
		globalFlags: 'الأعلام العامة:',
		commands: 'الأوامر:',
		flagWorkspace: 'جذر مساحة العمل (الافتراضي: الدليل الحالي)',
		flagRemote: 'استخدم نقل stdio (tcp:// محجوز للإصدار v2)',
		flagPlugins: 'إضافات إضافية لتحميلها في خادم MCP',
		flagPreset: 'إعداد core المسبق المرسل إلى خادم MCP',
		flagConfig: 'ملف الإعدادات المرسل إلى خادم MCP',
		flagAgentWorktree:
			'تفعيل worktrees git لكل وكيل (على مستوى المضيف؛ معطل افتراضيا)',
		flagJson: 'اطبع JSON مستقرا',
		flagHelp: 'اعرض المساعدة',
		flagVersion: 'اعرض الإصدار',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
	},
	de: {
		usage: 'Verwendung:',
		globalFlags: 'Globale Flags:',
		commands: 'Befehle:',
		flagWorkspace: 'Workspace-Root (Standard: aktuelles Verzeichnis)',
		flagRemote: 'Stdio-Transport verwenden (tcp:// ist fuer v2 reserviert)',
		flagPlugins: 'Zusaetzliche Plugins fuer den MCP-Server laden',
		flagPreset: 'Core-Plugin-Preset fuer den MCP-Server',
		flagConfig: 'Konfigurationsdatei fuer den MCP-Server',
		flagAgentWorktree:
			'Git-Worktrees pro Agent aktivieren (host-weit; Standard aus)',
		flagJson: 'Stabiles JSON ausgeben',
		flagHelp: 'Hilfe anzeigen',
		flagVersion: 'Version anzeigen',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
	},
	fr: {
		usage: 'Utilisation :',
		globalFlags: 'Options globales :',
		commands: 'Commandes :',
		flagWorkspace: 'Racine du workspace (defaut : repertoire courant)',
		flagRemote: 'Utilise le transport stdio (tcp:// est reserve a v2)',
		flagPlugins: 'Plugins supplementaires a charger dans le serveur MCP',
		flagPreset: 'Preset core envoye au serveur MCP',
		flagConfig: 'Fichier de configuration envoye au serveur MCP',
		flagAgentWorktree:
			'Activer les worktrees git par agent (au niveau hote ; desactive par defaut)',
		flagJson: 'Afficher du JSON stable',
		flagHelp: 'Afficher l aide',
		flagVersion: 'Afficher la version',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
	},
	hi: {
		usage: 'उपयोग:',
		globalFlags: 'वैश्विक फ्लैग:',
		commands: 'कमांड:',
		flagWorkspace: 'वर्कस्पेस रूट (डिफॉल्ट: वर्तमान डायरेक्टरी)',
		flagRemote: 'stdio transport उपयोग करें (tcp:// v2 के लिए आरक्षित है)',
		flagPlugins: 'MCP सर्वर में लोड करने के लिए अतिरिक्त प्लगइन',
		flagPreset: 'MCP सर्वर को दिया जाने वाला core plugin preset',
		flagConfig: 'MCP सर्वर को दिया जाने वाला config file',
		flagAgentWorktree:
			'प्रति-एजेंट git worktree सक्षम करें (host-स्तर; डिफ़ॉल्ट बंद)',
		flagJson: 'स्थिर JSON प्रिंट करें',
		flagHelp: 'मदद दिखाएं',
		flagVersion: 'वर्जन दिखाएं',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
	},
	it: {
		usage: 'Uso:',
		globalFlags: 'Flag globali:',
		commands: 'Comandi:',
		flagWorkspace: 'Root del workspace (default: directory corrente)',
		flagRemote: 'Usa il trasporto stdio (tcp:// e riservato a v2)',
		flagPlugins: 'Plugin extra da caricare nel server MCP',
		flagPreset: 'Preset core passato al server MCP',
		flagConfig: 'File di configurazione passato al server MCP',
		flagAgentWorktree:
			'Abilita worktree git per agente (a livello host; disattivo di default)',
		flagJson: 'Stampa JSON stabile',
		flagHelp: 'Mostra aiuto',
		flagVersion: 'Mostra versione',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
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
		flagAgentWorktree:
			'エージェントごとの git worktree を有効化 (ホスト単位; 既定は無効)',
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
	pt: {
		usage: 'Uso:',
		globalFlags: 'Flags globais:',
		commands: 'Comandos:',
		flagWorkspace: 'Raiz do workspace (padrao: diretorio atual)',
		flagRemote: 'Usa transporte stdio (tcp:// fica reservado para v2)',
		flagPlugins: 'Plugins extra para carregar no servidor MCP',
		flagPreset: 'Preset core enviado ao servidor MCP',
		flagConfig: 'Arquivo de configuracao enviado ao servidor MCP',
		flagAgentWorktree:
			'Habilita worktrees git por agente (a nivel host; desativado por padrao)',
		flagJson: 'Imprime JSON estavel',
		flagHelp: 'Mostra ajuda',
		flagVersion: 'Mostra a versao',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
	},
	th: {
		usage: 'วิธีใช้:',
		globalFlags: 'แฟล็กส่วนกลาง:',
		commands: 'คำสั่ง:',
		flagWorkspace: 'ราก workspace (ค่าเริ่มต้น: ไดเรกทอรีปัจจุบัน)',
		flagRemote: 'ใช้ stdio transport (tcp:// สงวนไว้สำหรับ v2)',
		flagPlugins: 'ปลั๊กอินเพิ่มเติมที่จะโหลดเข้า MCP server',
		flagPreset: 'core plugin preset ที่ส่งให้ MCP server',
		flagConfig: 'ไฟล์ config ที่ส่งให้ MCP server',
		flagAgentWorktree:
			'เปิดใช้ git worktree ต่อเอเจนต์ (ระดับโฮสต์; ปิดโดยค่าเริ่มต้น)',
		flagJson: 'พิมพ์ JSON แบบเสถียร',
		flagHelp: 'แสดงความช่วยเหลือ',
		flagVersion: 'แสดงเวอร์ชัน',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
	},
	vi: {
		usage: 'Cach dung:',
		globalFlags: 'Co toan cuc:',
		commands: 'Lenh:',
		flagWorkspace: 'Goc workspace (mac dinh: thu muc hien tai)',
		flagRemote: 'Dung stdio transport (tcp:// danh cho v2)',
		flagPlugins: 'Plugin bo sung de nap vao MCP server',
		flagPreset: 'Core plugin preset truyen vao MCP server',
		flagConfig: 'File cau hinh truyen vao MCP server',
		flagAgentWorktree:
			'Bat git worktree theo tung agent (cap host; mac dinh tat)',
		flagJson: 'In JSON on dinh',
		flagHelp: 'Hien thi tro giup',
		flagVersion: 'Hien thi phien ban',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
	},
	zh: {
		usage: '用法:',
		globalFlags: '全局标志:',
		commands: '命令:',
		flagWorkspace: '工作区根目录 (默认: 当前目录)',
		flagRemote: '使用 stdio 传输 (tcp:// 保留给 v2)',
		flagPlugins: '加载到 MCP 服务器的额外插件',
		flagPreset: '传给 MCP 服务器的 core 插件预设',
		flagConfig: '传给 MCP 服务器的配置文件',
		flagAgentWorktree: '启用按代理的 git worktree (主机级；默认关闭)',
		flagJson: '输出稳定 JSON',
		flagHelp: '显示帮助',
		flagVersion: '显示版本',
		commandSummaries: ENGLISH_COMMAND_SUMMARIES,
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
