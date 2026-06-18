import type { Dict } from "../shared";

const dict: Dict = {
	"nav.concept": "Concetto",
	"nav.install": "Installa",
	"nav.tools": "Strumenti",
	"nav.benchmarks": "Benchmark",
	"nav.plugins": "Plugin",
	"nav.github": "GitHub",
	"hero.title.a": "L'",
	"hero.title.b": "MCP Vertex",
	"hero.title.c": " agnostico",
	"hero.subheader": "Un core di server MCP + caricatore di plugin per qualsiasi progetto.",
	"hero.tagline":
		"Un core di server Model Context Protocol agnostico al progetto. Il core non sa nulla del tuo dominio — le capacità arrivano come plugin che carichi su richiesta, tutte misurate per un basso costo in token.",
	"hero.ctaInstall": "Inizia",
	"hero.ctaTools": "Vedi gli strumenti",
	"hero.runsOn": "Gira su Node, Deno e bun · qualsiasi package manager",
	"marquee.runtimes": "Costruito con · gira su",
	"marquee.clients": "Client MCP e modelli",
	"concept.title": "Un core piccolo, molti plugin",
	"concept.body":
		"mcp-vertex è il core ermetico: registrazione deterministica degli strumenti, percorsi di workspace iniettati, un loader di plugin da CLI e una superficie di strumenti misurata in token. Tutto ciò che è specifico del dominio è un plugin — carica solo ciò che serve, sotto qualsiasi host o modello.",
	"concept.f1.t": "Agnostico al progetto",
	"concept.f1.b":
		"Nessun codice di dominio nel core. Lo stesso plugin si comporta in modo identico sotto qualsiasi host o modello.",
	"concept.f2.t": "Pochi token per design",
	"concept.f2.b":
		"Un solo overview, conoscenza pigra e JSON compatto. Un budget misurato protegge dalle regressioni in CI.",
	"concept.f3.t": "Concorrenza sicura",
	"concept.f3.b":
		"Scritture atomiche, un mutex inter-processo con token di proprietà e quarantena della corruzione.",
	"concept.f4.t": "Pronto per il multi-agente",
	"concept.f4.b":
		"Il plugin proposals coordina uno swarm: lock, coda di task, disgiunzione delle slice e notifiche push.",
	"install.title": "Installa ed esegui",
	"install.lead": "Aggiungilo e punta il tuo client MCP al binario mcp-vertex:",
	"install.verify": "Verifica che parta",
	"install.addto": "Aggiungilo al tuo IDE / agente",
	"install.presets": "Preset:",
	"install.oneCmd": "Un comando · qualsiasi IDE",
	"install.oneCmdNote": "Rileva il tuo IDE e aggiunge mcp-vertex — senza toccare gli altri server MCP.",
	"install.config":
		"Scegli un preset (minimal · standard · swarm) o elenca i plugin. Esegui con --check per l'autodiagnosi.",
	"tools.title": "Strumenti",
	"tools.lead":
		"Ogni strumento esposto dall'insieme completo di plugin, raggruppato per namespace — estratto dal registro vivo, così questa pagina non diverge mai dal codice.",
	"tools.count": "strumenti",
	"tools.packages": "pacchetti",
	"bench.title": "Misurato, non promesso",
	"bench.lead":
		"L'efficienza dei token è un invariante protetto — un test CI fallisce se questi tetti regrediscono.",
	"bench.b1.t": "avvio a freddo",
	"bench.b1.b":
		"overview (compatto) + auto_work — orientamento completo sotto i 300 token.",
	"bench.b2.t": "niente polling",
	"bench.b2.b":
		"il rilascio dei lock è inviato (plugin notification), non interrogato in loop.",
	"bench.b3.t": "protetto dal drift",
	"bench.b3.b":
		"un SDK di tipi generato, budget di token e una rete e2e rigorosa sul protocollo reale.",
	"bench.live.title": "Costo di orientamento · misurato dal vivo",
	"bench.live.note":
		"Token del testo che un agente vede (≈4 byte/token), misurati dal vivo sul protocollo con proposals+memory. La baseline è una stima illustrativa dell'orientarsi a mano — non la misura di uno strumento di terzi.",
	"bench.baseline": "senza mcp-vertex (a mano · stima)",
	"plugins.title": "Plugin",
	"plugins.lead":
		"I pacchetti pubblicati. Carica solo ciò che serve; il core resta minuscolo.",
	"cfg.title": "Impostazioni",
	"cfg.theme": "Tema",
	"cfg.language": "Lingua",
	"cfg.motion": "Movimento",
	"cfg.motionLabel": "Anima i marquee",
	"footer.built": "Generato dal registro vivo degli strumenti.",
	"pluginpage.back": "Indietro",
	"pluginpage.tools": "Strumenti",
	"pluginpage.install": "Installazione",
	"plugin.proposals":
		"Coordinamento multi-agente: lock, coda di task, slice, round-context, riparazione dello stato.",
	"plugin.git": "Ispezione del repository in sola lettura: status, file modificati, diff, log.",
	"plugin.memory":
		"Note durature tra sessioni con recall BM25, quote, TTL e oscuramento dei segreti.",
	"plugin.search": "Ricerca a basso costo nel workspace: substring o regex, glob includi/escludi.",
	"plugin.rules":
		"Rilevamento del framework + linee guida lint/convenzioni; vince la config del progetto.",
	"plugin.quality":
		"Esegue i gate di qualità (lint/test/build) con policy allow/deny; annullabile.",
	"plugin.docs":
		"Cataloga e legge la documentazione markdown del progetto, navigazione curata a basso costo.",
	"plugin.deps":
		"Inventario offline delle dipendenze + salute (lockfile, range laschi, duplicati).",
	"plugin.notification": "Invia eventi di rilascio lock così gli agenti smettono di fare polling.",
	"plugin.core": "Il core agnostico: overview, scaffold, metriche, doctor e il loader di plugin.",
};

export default dict;
export { dict };