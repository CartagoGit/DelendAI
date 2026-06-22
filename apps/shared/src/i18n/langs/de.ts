// filepath: apps/shared/src/i18n/langs/de.ts
//
// S2 — merged language dictionary for `de`. Site section lifted
// from apps/web/src/i18n/langs/de.ts with the proposals/recovery/logs
// references inlined from apps/web/src/i18n/{proposals,logs}.ts. Extension
// section lifted from extensions/vscode/src/i18n/langs/de.ts. Tools
// section is reserved for future per-tool result translations.

import type { ILangDict } from '../shared';

const proposals = {
	statuses: {
		ready: {
			label: 'Ready',
			short: 'Queued',
			long: 'Triaged and ready for an agent to claim.',
		},
		in_progress: {
			label: 'In progress',
			short: 'Claimed',
			long: 'An agent owns the current slice and is actively working.',
		},
		review: {
			label: 'Review',
			short: 'Review',
			long: 'Implementation was submitted and awaits approval or changes.',
		},
		done: {
			label: 'Done',
			short: 'Closed',
			long: 'Approved, archived, and terminal unless later retired.',
		},
		paused: {
			label: 'Paused',
			short: 'Paused',
			long: 'Stopped by a human until it is explicitly resumed.',
		},
		blocked: {
			label: 'Blocked',
			short: 'Blocked',
			long: 'Waiting on dependencies or self-blocking proposal fixes.',
		},
		retired: {
			label: 'Retired',
			short: 'Retired',
			long: 'Cancelled or superseded; terminal.',
		},
	},
	kinds: {
		feat: {
			label: 'Feature',
			short: 'feat',
			long: 'User-visible capability; maps to a minor release.',
		},
		breaking: {
			label: 'Breaking',
			short: 'major',
			long: 'Breaking capability or contract change; maps to a major release.',
		},
		fix: {
			label: 'Fix',
			short: 'fix',
			long: 'Bug fix; maps to a patch release.',
		},
		refactor: {
			label: 'Refactor',
			short: 'refactor',
			long: 'Internal reshaping without intended behaviour change.',
		},
		perf: {
			label: 'Performance',
			short: 'perf',
			long: 'Performance improvement; maps to a patch release.',
		},
		audit: {
			label: 'Audit',
			short: 'audit',
			long: 'Investigation, review, or verification work.',
		},
		chore: {
			label: 'Chore',
			short: 'chore',
			long: 'Maintenance work that does not change product behaviour.',
		},
		docs: {
			label: 'Docs',
			short: 'docs',
			long: 'Documentation-only proposal.',
		},
		test: {
			label: 'Test',
			short: 'test',
			long: 'Test coverage or test infrastructure work.',
		},
		infra: {
			label: 'Infrastructure',
			short: 'infra',
			long: 'Build, CI, release, or operational infrastructure.',
		},
		spike: {
			label: 'Spike',
			short: 'spike',
			long: 'Research work that may not produce a release commit.',
		},
		legacy: {
			label: 'Legacy',
			short: 'legacy',
			long: 'Imported proposal from the pre-f00016 workflow.',
		},
	},
};
const recovery = {
	title: 'Recovery',
	lead: 'Agent-dead proposals and the safest recovery actions.',
	empty: 'No stale proposals are currently known.',
	agent: 'Agent',
	task: 'Task',
	lastSeen: 'Last seen',
	missedBeats: 'Missed beats',
	actions: 'Actions',
	releaseLock: 'Release lock',
	forceReady: 'Force ready',
};
const logs = {
	page_title: 'Logs',
	lead: 'Redacted MCP event timeline for tool calls, agents and recovery signals.',
	empty: 'No log events are available in the static snapshot.',
	filter_outcome: 'Outcome',
	filter_agent: 'Agent',
	filter_task: 'Task',
	copyTask: 'Copy task id',
	outcomes: {
		ok: 'OK',
		failed: 'Failed',
		timed_out: 'Timed out',
		cancelled: 'Cancelled',
		dead: 'Dead',
		idle: 'Idle',
		unknown: 'Unknown',
	},
	columns: {
		ts: 'Time',
		kind: 'Kind',
		agent: 'Agent',
		task: 'Task',
		outcome: 'Outcome',
		summary: 'Summary',
	},
};

const site = {
	nav: {
		concept: 'Konzept',
		install: 'Installieren',
		tools: 'Tools',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		presets: 'Presets',
		github: 'GitHub',
		menu: 'Menü',
		knowledge: 'Wissen',
		prompts: 'Prompts',
		resources: 'Ressourcen',
		skills: 'Skills',
		guide: 'Leitfaden',
		more: 'Mehr',
		firstFiveMinutes: 'Die ersten 5 Minuten',
		troubleshooting: 'Fehlerbehebung',
	},
	hero: {
		title: { a: 'Der agnostische ', b: 'MCP Vertex', c: '' },
		subheader: 'Ein MCP-Server-Kern + Plugin-Loader für jedes Projekt.',
		tagline:
			'Ein projektunabhängiger Model-Context-Protocol-Server-Kern. Der Kern weiß nichts über deine Domäne — Fähigkeiten kommen als Plugins, die du bei Bedarf lädst, alle auf geringen Token-Verbrauch gemessen.',
		ctaInstall: 'Loslegen',
		ctaTools: 'Tools ansehen',
		runsOn: 'Läuft unter Node, Deno & bun · jeder Paketmanager',
	},
	marquee: {
		runtimes: 'Gebaut mit · läuft unter',
		clients: 'MCP-Clients & Modelle',
	},
	concept: {
		title: 'Ein kleiner Kern, viele Plugins',
		body: 'mcp-vertex ist der hermetische Kern: deterministische Tool-Registrierung, injizierte Workspace-Pfade, ein CLI-Plugin-Loader und eine token-gemessene Tool-Oberfläche. Alles Domänenspezifische ist ein Plugin — lade nur, was du brauchst, unter jedem Host oder Modell.',
		f1: {
			t: 'Projektunabhängig',
			b: 'Kein Domänencode im Kern. Dasselbe Plugin verhält sich unter jedem Host oder Modell identisch.',
		},
		f2: {
			t: 'Token-sparsam by Design',
			b: 'Ein Overview, lazy Knowledge und kompaktes JSON. Ein gemessenes Budget schützt vor Regressionen in der CI.',
		},
		f3: {
			t: 'Sichere Nebenläufigkeit',
			b: 'Atomare Writes, ein prozessübergreifender Mutex mit Besitz-Tokens und Korruptions-Quarantäne.',
		},
		f4: {
			t: 'Multi-Agent-fähig',
			b: 'Das proposals-Plugin koordiniert einen Schwarm: Locks, Task-Queue, Slice-Disjunktheit und Push-Benachrichtigungen.',
		},
	},
	install: {
		title: 'Installieren & starten',
		lead: 'Hinzufügen und den MCP-Client auf das mcp-vertex-Binary zeigen lassen:',
		verify: 'Prüfen, dass er startet',
		addto: 'Zu deinem IDE / Agent hinzufügen',
		presets: 'Presets:',
		oneCmd: 'Ein Befehl · jedes IDE',
		oneCmdNote:
			'Erkennt dein IDE und fügt mcp-vertex hinzu — ohne deine anderen MCP-Server anzurühren.',
		config: 'Wähle ein Preset (minimal · standard · swarm · full) oder liste Plugins explizit. Mit --check zur Selbstdiagnose.',
		excludeHelp:
			'Entferne Plugins aus der aufgelösten Menge mit --exclude-plugins= (Alias: --excludePlugins=). Praktisch, um ein Plugin aus einem Preset zu werfen, ohne es zu forken — z. B. --preset=swarm --exclude-plugins=notification für eine Einzel-Agent-Sitzung.',
		tabsPackageManager: 'Paketmanager',
		tabsIde: 'IDE / Agent',
		tabsPreset: 'Preset',
		pmStep1Title: '1. Initialisieren',
		pmStep1Body:
			'Führe den Ein-Befehl-Installer aus. Er erkennt deinen Editor, führt die Konfiguration zusammen und zeigt, was er getan hat.',
		pmStep2Title: '2. Prüfen',
		pmStep2Body:
			'Starte denselben Paketmanager mit `--check` für die Selbstdiagnose.',
		pmRecommend: 'Empfohlen',
		ideFileLabel: 'Konfig-Datei',
		ideScopeLabel: 'Geltungsbereich',
		ideScopeProject: 'Projekt',
		ideScopeGlobal: 'global',
		ideScopeBoth: 'Projekt / global',
		ideWhyLabel: 'Warum diese Form?',
		ideWhyBody:
			'Jede IDE verwendet einen leicht anderen JSON-Schlüssel (`mcpServers`, `servers`, `context_servers`) und einen anderen Pfad. Der Renderer passt sich automatisch an — einfach einfügen.',
		presetSizeLabel: 'Plugins',
		presetUseLabel: 'Verwenden für',
		presetPluginsLabel: 'Enthaltene Plugins',
		presetFoot:
			'Übergib ein beliebiges Preset mit `--preset=<name>`. Presets sind additiv — kombiniere `--include-plugins=` und `--exclude-plugins=` zum Feintunen ohne Fork.',
		copy: 'Kopieren',
		copied: 'Kopiert!',
		faqTitle: 'Häufige Fragen',
		faqQ1: 'Warum startet `deno run -A npm:@mcp-vertex/core` langsam?',
		faqA1: 'Deno löst das npm-Paket bei der ersten Verwendung auf und verifiziert es. Folgeaufrufe nutzen den Cache in `~/.cache/deno`. Für wiederholte Starts sind bun oder npx besser.',
		faqQ2: 'Meine IDE ist nicht gelistet — was nun?',
		faqA2: 'Jede IDE, die einen stdio-MCP-Server akzeptiert, funktioniert. Nimm das JSON aus VS Code, ändere den Dateipfad auf den von deiner IDE erwarteten und registriere denselben Befehl + Argumente.',
		faqQ3: 'Kann ich mehrere Presets gleichzeitig ausführen?',
		faqA3: 'Nein — ein Server, ein Preset. Wenn du pro Projekt unterschiedliche Plugin-Sets brauchst, lege eine `mcp-vertex.config.json` im Projekt ab und der Loader liest sie zuerst.',
	},
	tools: {
		title: 'Tools',
		lead: 'Jedes Tool des vollen Plugin-Sets, nach Namespace gruppiert — aus dem Live-Registry gelesen, daher driftet diese Seite nie vom Code ab.',
		count: 'Tools',
		packages: 'Pakete',
	},
	bench: {
		title: 'Gemessen, nicht behauptet',
		lead: 'Token-Effizienz ist eine geschützte Invariante — ein CI-Test schlägt fehl, wenn diese Grenzen regressieren.',
		b1: {
			t: 'Kaltstart',
			b: 'overview (kompakt) + auto_work — volle Orientierung unter 300 Tokens.',
		},
		b2: {
			t: 'kein Polling',
			b: 'Lock-Freigabe wird gepusht (notification-Plugin), nicht in einer Schleife abgefragt.',
		},
		b3: {
			t: 'drift-geschützt',
			b: 'ein generiertes Typ-SDK, Token-Budgets und ein striktes e2e-Netz über das echte Protokoll.',
		},
		live: {
			title: 'Orientierungskosten · live gemessen',
			note: 'Tokens des Ergebnistexts, den ein Agent sieht (≈4 Bytes/Token), live über das Protokoll mit proposals+memory gemessen. Die Baseline ist eine illustrative Schätzung manueller Orientierung — keine Messung eines Drittanbieter-Tools.',
		},
		baseline: 'ohne mcp-vertex (manuell · Schätzung)',
	},
	plugins: {
		title: 'Plugins',
		lead: 'Die veröffentlichten Pakete. Lade nur, was du brauchst; der Kern bleibt winzig.',
	},
	cfg: {
		title: 'Einstellungen',
		theme: 'Thema',
		language: 'Sprache',
		motion: 'Animation',
		motionLabel: 'Marquees animieren',
	},
	search: {
		title: 'Suchen',
		placeholder: 'Seite durchsuchen...',
	},
	footer: {
		built: 'Aus dem Live-Tool-Registry generiert.',
		tagline: 'Ein projekt-agnostischer MCP-Server-Kern + Plugin-Loader.',
		sections: 'Bereiche',
		resources: 'Ressourcen',
		madeBy: 'Erstellt von Cartago · @CartagoGit auf GitHub',
		creatorsRepo: 'Ersteller auf GitHub',
		creatorsNpm: 'Ersteller auf npm',
	},
	pluginpage: {
		back: 'Zurück',
		tools: 'Tools',
		install: 'Installation',
		tabInstall: 'Installation',
		tabTools: 'Tools',
		tabConfiguration: 'Konfiguration',
		tabTutorial: 'Anleitung',
	},
	plugin: {
		proposals:
			'Multi-Agent-Koordination: Locks, Task-Queue, Slices, Round-Context, State-Reparatur.',
		git: 'Read-only-Repository-Inspektion: Status, geänderte Dateien, Diff, Log.',
		memory: 'Dauerhafte sitzungsübergreifende Notizen mit BM25-Recall, Quotas, TTL und Secret-Maskierung.',
		search: 'Token-sparsame Workspace-Suche: Substring oder Regex, Glob include/exclude.',
		rules: 'Framework-Erkennung + Lint/Konventions-Hinweise; die Projektkonfiguration gewinnt.',
		quality:
			'Quality-Gates (Lint/Test/Build) mit allow/deny-Policy ausführen; abbrechbar.',
		docs: 'Projekt-Markdown katalogisieren und lesen, kuratierte token-sparsame Navigation.',
		deps: 'Offline-Abhängigkeitsinventar + Health (Lockfile, lose Ranges, Duplikate).',
		notification: 'Pusht Lock-Freigabe-Events, damit Agenten nicht pollen.',
		logs: 'Append-only redacted event log with query, tail and correlation tools.',
		'status-marker':
			'Pflicht-Schlussmarker in Farbe für jede Agent-Antwort: 8 kanonische Zustände, Helfer- und Validator-Tools.',
		core: 'Der agnostische Kern: overview, Scaffold, Metriken, Doctor und der Plugin-Loader.',
	},
	toolpage: {
		back: 'Zurück',
		backToPlugin: 'Zurück zum Plugin',
		arguments: 'Argumente',
		argName: 'Argument',
		argType: 'Typ',
		argRequired: 'Erforderlich',
		argDescription: 'Beschreibung',
		argRequiredYes: 'ja',
		argRequiredNo: 'nein',
		noArguments: 'Dieses Tool akzeptiert keine Argumente.',
		effects: 'Effekte',
		effectReadOnly: 'nur lesen',
		example: 'Beispielaufruf',
		exampleNote:
			'Dargestellt als generischer MCP-Tool-Call-Payload; der genaue Transport hängt von deinem Client ab.',
		plugin: 'Plugin',
	},
	firstFiveMinutes: {
		title: 'Die ersten 5 Minuten',
		lead: 'Drei copy-paste-fertige Schnellstarts. Wähle den, der zu deiner Art passt, mcp-vertex auszuführen.',
		profileTabBunNode: 'Bun / Node',
		profileTabVscode: 'VS Code / Copilot',
		profileTabClaude: 'Claude Code',
		bunNode: {
			title: 'Bun / Node — den Server direkt ausführen',
			intro: 'Keine Editor-Integration nötig: starte den Host-Server im Terminal und richte einen beliebigen MCP-Client auf dessen stdio-Transport.',
			steps: [
				'Installieren: `bun add @mcp-vertex/core` (oder `npm install @mcp-vertex/core`).',
				'Starten: `bunx mcp-vertex --preset=standard` (oder `npx mcp-vertex --preset=standard`).',
				'Prüfen: der Prozess gibt die Liste der geladenen Plugins aus und wartet auf stdio — Ctrl+C zum Beenden.',
				'Richte die Konfiguration deines MCP-Clients mit `--preset=minimal|standard|swarm|full` auf das Binary (vollständige Flag-Liste unter Installieren).',
				'Rufe zuerst `mcp-vertex_overview { compact: true }` auf — es sagt dir, was als Nächstes zu tun ist.',
			],
		},
		vscode: {
			title: 'VS Code / GitHub Copilot',
			intro: 'Der Ein-Befehl-Installer erkennt VS Code und fügt mcp-vertex zu deiner MCP-Server-Liste hinzu, ohne bestehende Server anzurühren.',
			steps: [
				'Führe den Ein-Befehl-Installer von der Installieren-Seite aus (erkennt dein IDE automatisch).',
				'Lade das Fenster neu (`Developer: Reload Window`), damit Copilot den neuen Server erkennt.',
				'Öffne das Copilot-Chat-Panel und wähle den `mcp-vertex`-Agenten im Agenten-Auswähler.',
				'Lass ihn `mcp-vertex_overview` aufrufen — er sollte das geladene Preset und eine empfohlene nächste Aktion melden.',
				'Falls der Server nicht erscheint, siehe Fehlerbehebung → "MCP server not detected".',
			],
		},
		claude: {
			title: 'Claude Code',
			intro: 'Claude Code liest `.mcp.json` im Workspace-Root; der Installer schreibt oder mergt diese Datei für dich.',
			steps: [
				'Führe den Ein-Befehl-Installer aus — er erkennt Claude Code und schreibt `.mcp.json`.',
				'Starte Claude Code neu (oder führe `/mcp` aus, um Server neu zu laden), damit der neue Eintrag erkannt wird.',
				'In einer neuen Sitzung verweisen die immer geladenen `AGENTS.md` + `CLAUDE.md` bereits auf `mcp-vertex_overview` als ersten Aufruf.',
				'Bestätige mit `mcp-vertex_overview { compact: true }` — das Feld `recommendedNextAction` sagt dir, was als Nächstes zu tun ist.',
				'Für Multi-Agent-Sitzungen lies den Skill `proposal-swarm-runner`, bevor du einen Slice claimst.',
			],
		},
		nextSteps: 'Wie geht es weiter',
		nextToolsCta: 'Alle Tools durchsuchen',
		nextTroubleshootingCta: 'Funktioniert etwas nicht? Fehlerbehebung',
	},
	troubleshooting: {
		title: 'Fehlerbehebung',
		lead: 'Symptom → wahrscheinliche Ursache → Lösung, für die tatsächlich gemeldeten Probleme.',
		symptom: 'Symptom',
		cause: 'Wahrscheinliche Ursache',
		fix: 'Lösung',
		tags: 'Tags',
		backToIndex: 'Zurück zur Fehlerbehebung',
		closedBy: 'Geschlossen durch',
		empty: 'Noch kein Fehlerbehebungsfall passt zu diesem Filter.',
	},
	knowledge: {
		title: 'Wissen',
		lead: 'Katalogisierte Dokumente, zu denen der Kern Fragen beantworten kann.',
		count: 'Dokumente',
	},
	prompts: {
		title: 'Prompts',
		lead: 'Wiederverwendbare Prompt-Vorlagen, die der Kern bereitstellt.',
		count: 'Prompts',
		arg: 'Argumente',
	},
	resources: {
		title: 'Ressourcen',
		lead: 'Statische Ressourcen, die mit dem Projekt gebündelt sind (URI + MIME).',
		count: 'Ressourcen',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Skills',
		lead: 'Domänen-Playbooks, die der Agent bei Bedarf laden kann.',
		count: 'Skills',
		body: 'Inhalt',
	},
	notFound: {
		code: '404',
		title: 'Seite nicht gefunden',
		lead: 'Die gesuchte Seite existiert nicht oder wurde verschoben. Der Kern bleibt agnostisch — sogar gegenüber kaputten URLs.',
		homeCta: 'Zur Startseite',
		toolsCta: 'Tools ansehen',
		homeAria: 'Zur Startseite',
	},
	proposals: proposals,
	recovery: recovery,
	logs: logs,
	presets: {
		title: 'Presets',
		lead: 'Vorkonfigurierte Plugin-Sets für unterschiedliche Arbeitsbereichsgrößen.',
		summary:
			'Dieses Repository enthält {count} eindeutige Plugins über Presets.',
		hostOnlyChip: 'Nur Host',
		installTitle: 'Verwendung',
		installLead:
			'Geben Sie beim Starten des MCP-Servers das Flag --preset an.',
		table: {
			preset: 'Preset',
		},
	},
	ui: {
		codeCopy: 'Kopieren',
		codeCopied: 'Kopiert!',
		codeCollapse: 'Einklappen',
		codeExpand: 'Ausklappen',
		calloutNote: 'Hinweis',
		calloutTip: 'Tipp',
		calloutWarn: 'Warnung',
		calloutDanger: 'Gefahr',
		tabsNext: 'Weiter',
		tabsPrev: 'Zurück',
		stepsOf: 'von',
	},
};

const extension = {
	overviewTitle: 'mcp-vertex Ubersicht',
	refresh: 'mcp-vertex: Aktualisieren',
	runValidation: 'mcp-vertex: Validierung ausfuhren',
	openProposalBoard: 'mcp-vertex: Vorschlagstafel offnen',
	showMetrics: 'mcp-vertex: Metriken anzeigen',
	toolsView: 'mcp-vertex Werkzeuge',
	proposalsView: 'mcp-vertex Vorschlage',
	statusTooltip: 'mcp-vertex Status',
	openDashboard: 'mcp-vertex: Dashboard offnen',
	openDocs: 'mcp-vertex: Dokumentation offnen',
	tabOverview: 'Ubersicht',
	tabMetrics: 'Metriken',
	tabTokens: 'Tokens',
	tabTools: 'Werkzeuge',
	tabPlugins: 'Plugins',
	tabSessions: 'Sitzungen',
	tabTimes: 'Zeiten',
	tabAgents: 'Agenten',
	tabDocs: 'Docs',
	kpiTools: 'Werkzeuge',
	kpiPlugins: 'Plugins',
	kpiProposals: 'Vorschlage',
	kpiCalls: 'Aufrufe',
	kpiTokens: 'Tokens',
	kpiSaved: 'Gespart',
	kpiWall: 'Gesamtzeit',
	kpiAgents: 'Agenten',
	refreshDashboard: 'Dashboard aktualisieren',
	docsUrlRejected: 'mcp-vertex: Docs-URL abgelehnt',
	openKnowledge: 'mcp-vertex: Wissensnavigator offnen',
	toolSearch: 'mcp-vertex: Werkzeuge suchen',
	restartServer: 'mcp-vertex: MCP-Server neu starten',
	openSettings: 'mcp-vertex: Einstellungen offnen',
	memorySave: 'mcp-vertex: Speichernotiz sichern',
	memoryForget: 'mcp-vertex: Speichernotiz vergessen',
	tabHealth: 'Zustand',
	healthHealthy: 'Gesund',
	healthDegraded: 'Beeintrachtigt',
	healthLocks: 'Sperren',
	healthStale: 'Inaktive Agenten',
	healthQueue: 'Warteschlange',
	serverRestartHint:
		'mcp-vertex: bitte Erweiterung neu laden, um den MCP-Server neu zu starten.',
};

const dict: ILangDict = {
	site: site as unknown as ILangDict['site'],
	extension: extension as unknown as ILangDict['extension'],
	tools: {},
};

export default dict;
