import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'Concetto',
		install: 'Installa',
		setup: 'Configurazione',
		capabilities: 'Capacità',
		tools: 'Strumenti',
		benchmarks: 'Benchmark',
		plugins: 'Plugin',
		presets: 'Preset',
		github: 'GitHub',
		menu: 'Menu',
		knowledge: 'Conoscenza',
		prompts: 'Prompt',
		resources: 'Risorse',
		skills: 'Skill',
		guide: 'Guida',
		more: 'Altro',
		firstFiveMinutes: 'I primi 5 minuti',
		troubleshooting: 'Risoluzione dei problemi',
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
		config: "Scegli un preset (minimal · standard · swarm · full) o elenca i plugin. Esegui con --check per l'autodiagnosi.",
		excludeHelp:
			'Sottrai plugin dall’insieme risolto con --exclude-plugins= (alias: --excludePlugins=). Utile per togliere un plugin da un preset senza biforcarlo — es. --preset=swarm --exclude-plugins=notification per una sessione single-agent.',
		tabsPackageManager: 'Gestore pacchetti',
		tabsIde: 'IDE / agente',
		tabsPreset: 'Preset',
		pmStep1Title: '1. Inizializza',
		pmStep1Body:
			'Esegui l’installer a un comando. Rileva l’editor, unisce la configurazione e mostra cosa ha fatto.',
		pmStep2Title: '2. Verifica',
		pmStep2Body:
			'Esegui lo stesso gestore con `--check` per l’autodiagnosi.',
		pmRecommend: 'Consigliato',
		ideFileLabel: 'File di config',
		ideScopeLabel: 'Ambito',
		ideScopeProject: 'progetto',
		ideScopeGlobal: 'globale',
		ideScopeBoth: 'progetto / globale',
		ideWhyLabel: 'Perché questa forma?',
		ideWhyBody:
			'Ogni IDE usa una chiave JSON leggermente diversa (`mcpServers`, `servers`, `context_servers`) e un percorso differente. Il renderer si adatta automaticamente — incollalo così com’è.',
		presetSizeLabel: 'plugin',
		presetUseLabel: 'Usalo per',
		presetPluginsLabel: 'Plugin inclusi',
		presetFoot:
			'Passa qualsiasi preset al server con `--preset=<nome>`. I preset sono additivi — combina `--include-plugins=` e `--exclude-plugins=` per rifinire senza fork.',
		copy: 'Copia',
		copied: 'Copiato!',
		faqTitle: 'Domande frequenti',
		faqQ1: 'Perché `deno run -A npm:@mcp-vertex/core` è lento ad avviarsi?',
		faqA1: 'Deno risolve e verifica il pacchetto npm al primo utilizzo. Le esecuzioni successive riutilizzano la cache in `~/.cache/deno`. Per avvii ripetuti, preferisci bun o npx.',
		faqQ2: 'Il mio IDE non è elencato — cosa faccio?',
		faqA2: 'Qualsiasi IDE che accetta un server MCP stdio funziona. Prendi il JSON da VS Code, cambia il percorso a quello atteso dal tuo IDE e registra lo stesso comando + argomenti.',
		faqQ3: 'Posso eseguire più preset insieme?',
		faqA3: 'No — un server, un preset. Se servono set di plugin diversi per progetto, metti un `mcp-vertex.config.json` in quel progetto e il loader lo legge prima.',
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
	search: {
		title: 'Cerca',
		placeholder: 'Cerca nel sito...',
	},
	footer: {
		built: 'Generato dal registro vivo degli strumenti.',
		tagline:
			'Un nucleo di server MCP agnostico al progetto + caricatore di plugin.',
		sections: 'Sezioni',
		resources: 'Risorse',
		madeBy: 'Realizzato da Cartago · @CartagoGit su GitHub',
		creatorsRepo: 'Autore su GitHub',
		creatorsNpm: 'Autore su npm',
	},
	pluginpage: {
		back: 'Indietro',
		tools: 'Strumenti',
		install: 'Installazione',
		tabInstall: 'Installazione',
		tabTools: 'Strumenti',
		tabConfiguration: 'Configurazione',
		tabTutorial: 'Tutorial',
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
		logs: 'Append-only redacted event log with query, tail and correlation tools.',
		'status-marker':
			'Marker di chiusura colorato obbligatorio per ogni risposta dell’agente: 8 stati canonici, strumenti helper + validatore.',
		core: 'Il core agnostico: overview, scaffold, metriche, doctor e il loader di plugin.',
		issues: {
			description:
				'GitHub issues plugin — ingest, analyse and (optionally) promote to a proposal.',
			requires: 'requires',
			installSnippet: 'mcp-vertex --plugins=proposals,issues',
		},
	},
	toolpage: {
		back: 'Indietro',
		backToPlugin: 'Torna al plugin',
		arguments: 'Argomenti',
		argName: 'Argomento',
		argType: 'Tipo',
		argRequired: 'Obbligatorio',
		argDescription: 'Descrizione',
		argRequiredYes: 'sì',
		argRequiredNo: 'no',
		noArguments: 'Questo strumento non richiede argomenti.',
		effects: 'Effetti',
		effectReadOnly: 'sola lettura',
		example: 'Chiamata di esempio',
		exampleNote:
			'Mostrato come un payload generico di chiamata a uno strumento MCP; il trasporto esatto dipende dal tuo client.',
		plugin: 'Plugin',
	},
	firstFiveMinutes: {
		title: 'I primi 5 minuti',
		lead: 'Tre guide rapide da copiare e incollare. Scegli quella che corrisponde a come esegui mcp-vertex.',
		profileTabBunNode: 'Bun / Node',
		profileTabVscode: 'VS Code / Copilot',
		profileTabClaude: 'Claude Code',
		bunNode: {
			title: 'Bun / Node — esegui il server direttamente',
			intro: "Nessuna integrazione con l'editor richiesta: esegui il host server da un terminale e punta qualsiasi client MCP al suo trasporto stdio.",
			steps: [
				'Installa: `bun add @mcp-vertex/core` (o `npm install @mcp-vertex/core`).',
				'Esegui: `bunx mcp-vertex --preset=standard` (o `npx mcp-vertex --preset=standard`).',
				'Verifica: il processo stampa la lista dei plugin caricati e resta in attesa su stdio — Ctrl+C per fermarlo.',
				'Punta la configurazione del tuo client MCP al binario con `--preset=minimal|standard|swarm|full` (vedi Installa per la lista completa dei flag).',
				'Chiama prima `mcp-vertex_overview { compact: true }` — ti dice cosa fare dopo.',
			],
		},
		vscode: {
			title: 'VS Code / GitHub Copilot',
			intro: 'L’installatore a comando unico rileva VS Code e aggiunge mcp-vertex alla tua lista di server MCP senza toccare quelli esistenti.',
			steps: [
				'Esegui l’installatore a comando unico dalla pagina Installa (rileva il tuo IDE automaticamente).',
				'Ricarica la finestra (`Developer: Reload Window`) perché Copilot riconosca il nuovo server.',
				'Apri il pannello chat di Copilot e seleziona l’agente `mcp-vertex` nel selettore degli agenti.',
				'Chiedigli di chiamare `mcp-vertex_overview` — dovrebbe riportare il preset caricato e un’azione raccomandata.',
				'Se il server non appare, consulta Risoluzione dei problemi → "MCP server not detected".',
			],
		},
		claude: {
			title: 'Claude Code',
			intro: 'Claude Code legge `.mcp.json` nella radice del workspace; l’installatore scrive o unisce quel file per te.',
			steps: [
				'Esegui l’installatore a comando unico — rileva Claude Code e scrive `.mcp.json`.',
				'Riavvia Claude Code (o esegui `/mcp` per ricaricare i server) perché riconosca la nuova voce.',
				'In una sessione nuova, i file sempre caricati `AGENTS.md` + `CLAUDE.md` puntano già a `mcp-vertex_overview` come prima chiamata.',
				'Confermalo con `mcp-vertex_overview { compact: true }` — il campo `recommendedNextAction` ti dice cosa fare dopo.',
				'Per sessioni multi-agente, leggi lo skill `mcp-vertex-proposal-swarm-runner` prima di reclamare uno slice.',
			],
		},
		nextSteps: 'Dove andare dopo',
		nextToolsCta: 'Esplora tutti gli strumenti',
		nextTroubleshootingCta:
			'Qualcosa non funziona? Risoluzione dei problemi',
	},
	troubleshooting: {
		title: 'Risoluzione dei problemi',
		lead: 'Sintomo → causa probabile → soluzione, per i problemi realmente segnalati.',
		symptom: 'Sintomo',
		cause: 'Causa probabile',
		fix: 'Soluzione',
		tags: 'Tag',
		backToIndex: 'Torna alla risoluzione dei problemi',
		closedBy: 'Chiuso da',
		empty: 'Nessun caso di risoluzione dei problemi corrisponde ancora a questo filtro.',
	},
	knowledge: {
		title: 'Conoscenza',
		lead: 'Documenti catalogati su cui il core può rispondere a domande.',
		count: 'documenti',
	},
	prompts: {
		title: 'Prompt',
		lead: 'Modelli di prompt riutilizzabili esposti dal core.',
		count: 'prompt',
		arg: 'argomenti',
	},
	resources: {
		title: 'Risorse',
		lead: 'Risorse statiche fornite con il progetto (URI + MIME).',
		count: 'risorse',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Skill',
		lead: 'Manuali di dominio che l’agente può caricare su richiesta.',
		count: 'skill',
		body: 'Corpo',
	},
	notFound: {
		code: '404',
		title: 'Pagina non trovata',
		lead: 'La pagina che cerchi non esiste o è stata spostata. Il core resta agnostico — anche rispetto agli URL rotti.',
		homeCta: "Torna all'inizio",
		toolsCta: 'Vedi gli strumenti',
		homeAria: "Vai all'inizio",
	},
	proposals: proposalGlossaryByLang.it,
	recovery: recoveryByLang.it,
	logs: logsByLang.it,
	presets: {
		title: 'Preset',
		lead: 'Set di plugin preconfigurati per diverse dimensioni dell’area di lavoro.',
		summary:
			'Questo repository contiene {count} plugin unici tra i preset.',
		hostOnlyChip: 'solo host',
		installTitle: 'Come usare',
		installLead: 'Specifica il flag --preset all’avvio del server MCP.',
		table: {
			preset: 'Preset',
		},
	},
	setup: {
		title: 'Configurazione tra progetti',
		lead: 'Integra mcp-vertex in qualsiasi repository e prepara il plugin issues di GitHub per quel repo — gli stessi 7 passaggi eseguiti dal comando setup-github.',
		stepsTitle: 'I 7 passaggi',
		docsLinkLabel:
			'Leggi la guida canonica alla configurazione tra progetti',
		detectRepoTitle: 'Rileva il repo',
		detectRepoBody:
			'Legge il remote di GitHub e lo normalizza in owner/name. Lo slug rilevato deve puntare al repo previsto.',
		confirmRepoTitle: 'Conferma owner/name',
		confirmRepoBody:
			'Esegui il comando di configurazione e conferma (o sostituisci) lo slug rilevato prima di scrivere qualsiasi cosa.',
		pickAuthTierTitle: 'Scegli il livello di autenticazione',
		pickAuthTierBody:
			'Usa gh quando gh auth status riesce, rest-authed quando GITHUB_TOKEN è impostato, altrimenti rest-anon (limitato a 60 richieste/ora).',
		writeConfigTitle: 'Scrivi la configurazione',
		writeConfigBody:
			'Scrive plugins.issues.options.repo in mcp-vertex.config.json senza toccare le altre impostazioni dei plugin.',
		verifyTierTitle: 'Verifica il livello',
		verifyTierBody:
			'Avvia l’host con il plugin issues caricato per mettere alla prova end-to-end il livello di autenticazione scelto.',
		printInvocationTitle: 'Stampa l’invocazione',
		printInvocationBody:
			'Aggiungi questo blocco server al tuo mcp.json. La forma è identica per VS Code, Cursor e Claude Code.',
		markConfiguredTitle: 'Segna come configurato',
		markConfiguredBody:
			'Facoltativamente registra che questo repo è già stato configurato una volta, così le esecuzioni future saltano le richieste.',
		optionalLabel: 'facoltativo',
	},
	ui: {
		codeCopy: 'Copia',
		codeCopied: 'Copiato!',
		codeCollapse: 'Riduci',
		codeExpand: 'Espandi',
		calloutNote: 'Nota',
		calloutTip: 'Suggerimento',
		calloutWarn: 'Avviso',
		calloutDanger: 'Pericolo',
		tabsNext: 'Avanti',
		tabsPrev: 'Indietro',
		stepsOf: 'di',
	},

	homeQuickInstall: {
		title: 'Installazione rapida',
		lead: 'Scegli il tuo gestore di pacchetti. Lo stesso comando funziona con Node, Deno e Bun — il resto è nella pagina di installazione.',
		tabsLabel: 'Gestore di pacchetti',
		pms: [
			{ id: 'npm', note: 'Node Package Manager — incluso con Node.js.' },
			{
				id: 'pnpm',
				note: 'Veloce, efficiente su disco, risoluzione stretta delle dipendenze.',
			},
			{ id: 'yarn', note: 'Alternativa classica a npm.' },
			{
				id: 'bun',
				note: 'Runtime + gestore di pacchetti tutto-in-uno — mcp-vertex è costruito con bun.',
			},
			{
				id: 'deno',
				note: 'Runtime sicuro per impostazione predefinita con TypeScript di prima classe.',
			},
		],
		recommended: 'Consigliato',
		fullCta: 'Matrice di installazione completa',
	},
	homeAtAGlance: {
		title: 'Cosa può fare?',
		lead: 'Scegli una sezione. La home orienta solo — ogni punto di accesso ha una pagina dedicata con tutti i dettagli.',
		tabsLabel: 'Sezioni',
		openSection: 'Apri',
		panels: [
			{
				id: 'plugins',
				label: 'Plugin',
				summary:
					'Pacchetti pubblicati. Carica solo ciò che ti serve; il nucleo resta minimo.',
				href: 'plugins',
				icon: '/logos/plugin-proposals.svg',
			},
			{
				id: 'tools',
				label: 'Strumenti',
				summary:
					"Tutti gli strumenti dell'insieme completo di plugin, raggruppati per namespace — dal registro vivo.",
				href: 'tools',
				icon: '/logos/plugin-core.svg',
			},
			{
				id: 'bench',
				label: 'Benchmark',
				summary:
					"L'efficienza dei token è un invariante protetto — misurata, non promessa.",
				href: 'benchmarks',
				icon: '/logos/plugin-quality.svg',
			},
			{
				id: 'skills',
				label: 'Skill',
				summary:
					"Manuali di dominio che l'agente può caricare su richiesta.",
				href: 'skills',
				icon: '/logos/plugin-docs.svg',
			},
			{
				id: 'knowledge',
				label: 'Conoscenza',
				summary:
					'Documenti catalogati sui quali il nucleo può rispondere.',
				href: 'knowledge',
				icon: '/logos/plugin-memory.svg',
			},
			{
				id: 'presets',
				label: 'Preset',
				summary:
					'Set di plugin preconfigurati per qualsiasi dimensione di workspace.',
				href: 'presets',
				icon: '/logos/plugin-search.svg',
			},
			{
				id: 'setup',
				label: 'Setup tra progetti',
				summary:
					'Integra mcp-vertex in qualsiasi repo e prepara il plugin issues.',
				href: 'setup',
				icon: '/logos/github.png',
			},
		],
	},
};

export default dict;
