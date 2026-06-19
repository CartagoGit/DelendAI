import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: 'Concetto',
		install: 'Installa',
		tools: 'Strumenti',
		benchmarks: 'Benchmark',
		plugins: 'Plugin',
		github: 'GitHub',
		resources: 'Risorse',
		skills: 'Skill',
		guide: 'Guida',
	},
	hero: {
		title: { a: "L'", b: 'MCP Vertex', c: ' agnostico' },
		subheader:
			'Un core di server MCP + caricatore di plugin per qualsiasi progetto.',
		tagline:
			'Un core di server Model Context Protocol agnostico al progetto. Il core non sa nulla del tuo dominio — le capacità arrivano come plugin che carichi su richiesta, tutte misurate per un basso costo in token.',
		ctaInstall: 'Inizia',
		ctaTools: 'Vedi gli strumenti',
		runsOn: 'Gira su Node, Deno e bun · qualsiasi package manager',
	},
	marquee: {
		runtimes: 'Costruito con · gira su',
		clients: 'Client MCP e modelli',
	},
	concept: {
		title: 'Un core piccolo, molti plugin',
		body: 'mcp-vertex è il core ermetico: registrazione deterministica degli strumenti, percorsi di workspace iniettati, un loader di plugin da CLI e una superficie di strumenti misurata in token. Tutto ciò che è specifico del dominio è un plugin — carica solo ciò che serve, sotto qualsiasi host o modello.',
		f1: {
			t: 'Agnostico al progetto',
			b: 'Nessun codice di dominio nel core. Lo stesso plugin si comporta in modo identico sotto qualsiasi host o modello.',
		},
		f2: {
			t: 'Pochi token per design',
			b: 'Un solo overview, conoscenza pigra e JSON compatto. Un budget misurato protegge dalle regressioni in CI.',
		},
		f3: {
			t: 'Concorrenza sicura',
			b: 'Scritture atomiche, un mutex inter-processo con token di proprietà e quarantena della corruzione.',
		},
		f4: {
			t: 'Pronto per il multi-agente',
			b: 'Il plugin proposals coordina uno swarm: lock, coda di task, disgiunzione delle slice e notifiche push.',
		},
	},
	install: {
		title: 'Installa ed esegui',
		lead: 'Aggiungilo e punta il tuo client MCP al binario mcp-vertex:',
		verify: 'Verifica che parta',
		addto: 'Aggiungilo al tuo IDE / agente',
		presets: 'Preset:',
		oneCmd: 'Un comando · qualsiasi IDE',
		oneCmdNote:
			'Rileva il tuo IDE e aggiunge mcp-vertex — senza toccare gli altri server MCP.',
		config: "Scegli un preset (minimal · standard · swarm) o elenca i plugin. Esegui con --check per l'autodiagnosi.",
		excludeHelp:
			'Sottrai plugin dall’insieme risolto con --exclude-plugins= (alias: --excludePlugins=). Utile per togliere un plugin da un preset senza biforcarlo — es. --preset=swarm --exclude-plugins=notification per una sessione single-agent.',
	},
	tools: {
		title: 'Strumenti',
		lead: "Ogni strumento esposto dall'insieme completo di plugin, raggruppato per namespace — estratto dal registro vivo, così questa pagina non diverge mai dal codice.",
		count: 'strumenti',
		packages: 'pacchetti',
	},
	bench: {
		title: 'Misurato, non promesso',
		lead: "L'efficienza dei token è un invariante protetto — un test CI fallisce se questi tetti regrediscono.",
		b1: {
			t: 'avvio a freddo',
			b: 'overview (compatto) + auto_work — orientamento completo sotto i 300 token.',
		},
		b2: {
			t: 'niente polling',
			b: 'il rilascio dei lock è inviato (plugin notification), non interrogato in loop.',
		},
		b3: {
			t: 'protetto dal drift',
			b: 'un SDK di tipi generato, budget di token e una rete e2e rigorosa sul protocollo reale.',
		},
		live: {
			title: 'Costo di orientamento · misurato dal vivo',
			note: "Token del testo che un agente vede (≈4 byte/token), misurati dal vivo sul protocollo con proposals+memory. La baseline è una stima illustrativa dell'orientarsi a mano — non la misura di uno strumento di terzi.",
		},
		baseline: 'senza mcp-vertex (a mano · stima)',
	},
	plugins: {
		title: 'Plugin',
		lead: 'I pacchetti pubblicati. Carica solo ciò che serve; il core resta minuscolo.',
	},
	cfg: {
		title: 'Impostazioni',
		theme: 'Tema',
		language: 'Lingua',
		motion: 'Movimento',
		motionLabel: 'Anima i marquee',
	},
	footer: {
		built: 'Generato dal registro vivo degli strumenti.',
		tagline:
			'Un nucleo di server MCP agnostico al progetto + caricatore di plugin.',
		sections: 'Sezioni',
		resources: 'Risorse',
	},
	pluginpage: {
		back: 'Indietro',
		tools: 'Strumenti',
		install: 'Installazione',
	},
	plugin: {
		proposals:
			'Coordinamento multi-agente: lock, coda di task, slice, round-context, riparazione dello stato.',
		git: 'Ispezione del repository in sola lettura: status, file modificati, diff, log.',
		memory: 'Note durature tra sessioni con recall BM25, quote, TTL e oscuramento dei segreti.',
		search: 'Ricerca a basso costo nel workspace: substring o regex, glob includi/escludi.',
		rules: 'Rilevamento del framework + linee guida lint/convenzioni; vince la config del progetto.',
		quality:
			'Esegue i gate di qualità (lint/test/build) con policy allow/deny; annullabile.',
		docs: 'Cataloga e legge la documentazione markdown del progetto, navigazione curata a basso costo.',
		deps: 'Inventario offline delle dipendenze + salute (lockfile, range laschi, duplicati).',
		notification:
			'Invia eventi di rilascio lock così gli agenti smettono di fare polling.',
		'status-marker':
			'Marker di chiusura colorato obbligatorio per ogni risposta dell’agente: 8 stati canonici, strumenti helper + validatore.',
		core: 'Il core agnostico: overview, scaffold, metriche, doctor e il loader di plugin.',
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
		title: 'Pagina non trovata',
		lead: 'La pagina che cerchi non esiste o è stata spostata. Il core resta agnostico — anche rispetto agli URL rotti.',
		homeCta: "Torna all'inizio",
		toolsCta: 'Vedi gli strumenti',
		homeAria: "Vai all'inizio",
	},
};

export default dict;
