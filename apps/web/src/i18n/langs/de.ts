import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: 'Konzept',
		install: 'Installieren',
		tools: 'Tools',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		github: 'GitHub',
		resources: 'Ressourcen',
		skills: 'Skills',
		guide: 'Leitfaden',
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
		config: 'Wähle ein Preset (minimal · standard · swarm) oder liste Plugins explizit. Mit --check zur Selbstdiagnose.',
		excludeHelp:
			'Entferne Plugins aus der aufgelösten Menge mit --exclude-plugins= (Alias: --excludePlugins=). Praktisch, um ein Plugin aus einem Preset zu werfen, ohne es zu forken — z. B. --preset=swarm --exclude-plugins=notification für eine Einzel-Agent-Sitzung.',
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
	footer: {
		built: 'Aus dem Live-Tool-Registry generiert.',
		tagline: 'Ein projekt-agnostischer MCP-Server-Kern + Plugin-Loader.',
		sections: 'Bereiche',
		resources: 'Ressourcen',
		madeBy: 'Erstellt von Cartago · @CartagoGit auf GitHub',
		creatorsRepo: 'Ersteller auf GitHub',
		creatorsNpm: 'Ersteller auf npm',
	},
	pluginpage: { back: 'Zurück', tools: 'Tools', install: 'Installation' },
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
		'status-marker':
			'Pflicht-Schlussmarker in Farbe für jede Agent-Antwort: 8 kanonische Zustände, Helfer- und Validator-Tools.',
		core: 'Der agnostische Kern: overview, Scaffold, Metriken, Doctor und der Plugin-Loader.',
	},
	knowledge: {
		title: 'Knowledge',
		lead: 'Catalogued documents the core can answer questions about.',
		count: 'documents',
	},
	prompts: {
		title: 'Prompts',
		lead: 'Reusable prompt templates exposed by the core.',
		count: 'prompts',
		arg: 'arguments',
	},
	resources: {
		title: 'Resources',
		lead: 'Static resources bundled with the project (URI + MIME).',
		count: 'resources',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Skills',
		lead: 'Domain playbooks the agent can load on demand.',
		count: 'skills',
		body: 'Body',
	},
	notFound: {
		code: '404',
		title: 'Seite nicht gefunden',
		lead: 'Die gesuchte Seite existiert nicht oder wurde verschoben. Der Kern bleibt agnostisch — sogar gegenüber kaputten URLs.',
		homeCta: 'Zur Startseite',
		toolsCta: 'Tools ansehen',
		homeAria: 'Zur Startseite',
	},
};

export default dict;
