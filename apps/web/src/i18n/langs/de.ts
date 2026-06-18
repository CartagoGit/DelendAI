import type { Dict } from "../shared";

const dict: Dict = {
	"nav.concept": "Konzept",
	"nav.install": "Installieren",
	"nav.tools": "Tools",
	"nav.benchmarks": "Benchmarks",
	"nav.plugins": "Plugins",
	"nav.github": "GitHub",
	"hero.title.a": "Der agnostische ",
	"hero.title.b": "MCP Vertex",
	"hero.title.c": "",
	"hero.subheader": "Ein MCP-Server-Kern + Plugin-Loader für jedes Projekt.",
	"hero.tagline":
		"Ein projektunabhängiger Model-Context-Protocol-Server-Kern. Der Kern weiß nichts über deine Domäne — Fähigkeiten kommen als Plugins, die du bei Bedarf lädst, alle auf geringen Token-Verbrauch gemessen.",
	"hero.ctaInstall": "Loslegen",
	"hero.ctaTools": "Tools ansehen",
	"hero.runsOn": "Läuft unter Node, Deno & bun · jeder Paketmanager",
	"marquee.runtimes": "Gebaut mit · läuft unter",
	"marquee.clients": "MCP-Clients & Modelle",
	"concept.title": "Ein kleiner Kern, viele Plugins",
	"concept.body":
		"mcp-vertex ist der hermetische Kern: deterministische Tool-Registrierung, injizierte Workspace-Pfade, ein CLI-Plugin-Loader und eine token-gemessene Tool-Oberfläche. Alles Domänenspezifische ist ein Plugin — lade nur, was du brauchst, unter jedem Host oder Modell.",
	"concept.f1.t": "Projektunabhängig",
	"concept.f1.b":
		"Kein Domänencode im Kern. Dasselbe Plugin verhält sich unter jedem Host oder Modell identisch.",
	"concept.f2.t": "Token-sparsam by Design",
	"concept.f2.b":
		"Ein Overview, lazy Knowledge und kompaktes JSON. Ein gemessenes Budget schützt vor Regressionen in der CI.",
	"concept.f3.t": "Sichere Nebenläufigkeit",
	"concept.f3.b":
		"Atomare Writes, ein prozessübergreifender Mutex mit Besitz-Tokens und Korruptions-Quarantäne.",
	"concept.f4.t": "Multi-Agent-fähig",
	"concept.f4.b":
		"Das proposals-Plugin koordiniert einen Schwarm: Locks, Task-Queue, Slice-Disjunktheit und Push-Benachrichtigungen.",
	"install.title": "Installieren & starten",
	"install.lead": "Hinzufügen und den MCP-Client auf das mcp-vertex-Binary zeigen lassen:",
	"install.verify": "Prüfen, dass er startet",
	"install.addto": "Zu deinem IDE / Agent hinzufügen",
	"install.presets": "Presets:",
	"install.oneCmd": "Ein Befehl · jedes IDE",
	"install.oneCmdNote": "Erkennt dein IDE und fügt mcp-vertex hinzu — ohne deine anderen MCP-Server anzurühren.",
	"install.config":
		"Wähle ein Preset (minimal · standard · swarm) oder liste Plugins explizit. Mit --check zur Selbstdiagnose.",
	"tools.title": "Tools",
	"tools.lead":
		"Jedes Tool des vollen Plugin-Sets, nach Namespace gruppiert — aus dem Live-Registry gelesen, daher driftet diese Seite nie vom Code ab.",
	"tools.count": "Tools",
	"tools.packages": "Pakete",
	"bench.title": "Gemessen, nicht behauptet",
	"bench.lead":
		"Token-Effizienz ist eine geschützte Invariante — ein CI-Test schlägt fehl, wenn diese Grenzen regressieren.",
	"bench.b1.t": "Kaltstart",
	"bench.b1.b": "overview (kompakt) + auto_work — volle Orientierung unter 300 Tokens.",
	"bench.b2.t": "kein Polling",
	"bench.b2.b":
		"Lock-Freigabe wird gepusht (notification-Plugin), nicht in einer Schleife abgefragt.",
	"bench.b3.t": "drift-geschützt",
	"bench.b3.b":
		"ein generiertes Typ-SDK, Token-Budgets und ein striktes e2e-Netz über das echte Protokoll.",
	"bench.live.title": "Orientierungskosten · live gemessen",
	"bench.live.note":
		"Tokens des Ergebnistexts, den ein Agent sieht (≈4 Bytes/Token), live über das Protokoll mit proposals+memory gemessen. Die Baseline ist eine illustrative Schätzung manueller Orientierung — keine Messung eines Drittanbieter-Tools.",
	"bench.baseline": "ohne mcp-vertex (manuell · Schätzung)",
	"plugins.title": "Plugins",
	"plugins.lead":
		"Die veröffentlichten Pakete. Lade nur, was du brauchst; der Kern bleibt winzig.",
	"cfg.title": "Einstellungen",
	"cfg.theme": "Thema",
	"cfg.language": "Sprache",
	"cfg.motion": "Animation",
	"cfg.motionLabel": "Marquees animieren",
	"footer.built": "Aus dem Live-Tool-Registry generiert.",
	"pluginpage.back": "Zurück",
	"pluginpage.tools": "Tools",
	"pluginpage.install": "Installation",
	"plugin.proposals":
		"Multi-Agent-Koordination: Locks, Task-Queue, Slices, Round-Context, State-Reparatur.",
	"plugin.git": "Read-only-Repository-Inspektion: Status, geänderte Dateien, Diff, Log.",
	"plugin.memory":
		"Dauerhafte sitzungsübergreifende Notizen mit BM25-Recall, Quotas, TTL und Secret-Maskierung.",
	"plugin.search": "Token-sparsame Workspace-Suche: Substring oder Regex, Glob include/exclude.",
	"plugin.rules":
		"Framework-Erkennung + Lint/Konventions-Hinweise; die Projektkonfiguration gewinnt.",
	"plugin.quality":
		"Quality-Gates (Lint/Test/Build) mit allow/deny-Policy ausführen; abbrechbar.",
	"plugin.docs":
		"Projekt-Markdown katalogisieren und lesen, kuratierte token-sparsame Navigation.",
	"plugin.deps":
		"Offline-Abhängigkeitsinventar + Health (Lockfile, lose Ranges, Duplikate).",
	"plugin.notification": "Pusht Lock-Freigabe-Events, damit Agenten nicht pollen.",
	"plugin.core": "Der agnostische Kern: overview, Scaffold, Metriken, Doctor und der Plugin-Loader.",
};

export default dict;
export { dict };