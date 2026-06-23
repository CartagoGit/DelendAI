// filepath: apps/shared/src/i18n/langs/fr.ts
//
// S2 — merged language dictionary for `fr`. Site section lifted
// from apps/web/src/i18n/langs/fr.ts with the proposals/recovery/logs
// references inlined from apps/web/src/i18n/{proposals,logs}.ts. Extension
// section lifted from extensions/vscode/src/i18n/langs/fr.ts. Tools
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
		concept: 'Concept',
		install: 'Installer',
		tools: 'Outils',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		presets: 'Presets',
		github: 'GitHub',
		menu: 'Menu',
		knowledge: 'Connaissances',
		prompts: 'Prompts',
		resources: 'Ressources',
		skills: 'Compétences',
		guide: 'Guide',
		more: 'Plus',
		firstFiveMinutes: 'Les 5 premières minutes',
		troubleshooting: 'Dépannage',
	},
	hero: {
		title: { a: 'Le ', b: 'MCP Vertex', c: ' agnostique' },
		subheader:
			'Un cœur de serveur MCP + chargeur de plugins pour tout projet.',
		tagline:
			'Un cœur de serveur Model Context Protocol agnostique au projet. Le cœur ne sait rien de votre domaine — les capacités arrivent sous forme de plugins que vous chargez à la demande, toutes mesurées pour un faible coût en tokens.',
		ctaInstall: 'Commencer',
		ctaTools: 'Voir les outils',
		runsOn: 'Fonctionne sous Node, Deno et bun · tout gestionnaire de paquets',
	},
	marquee: {
		runtimes: 'Construit avec · tourne sous',
		clients: 'Clients MCP & modèles',
	},
	concept: {
		title: 'Un petit cœur, beaucoup de plugins',
		body: "mcp-vertex est le cœur hermétique : enregistrement déterministe des outils, chemins de workspace injectés, un chargeur de plugins en CLI et une surface d'outils mesurée en tokens. Tout ce qui est spécifique au domaine est un plugin — ne chargez que ce dont vous avez besoin, sous n'importe quel hôte ou modèle.",
		f1: {
			t: 'Agnostique au projet',
			b: "Aucun code métier dans le cœur. Le même plugin se comporte de façon identique sous n'importe quel hôte ou modèle.",
		},
		f2: {
			t: 'Peu de tokens par conception',
			b: 'Un seul overview, des connaissances paresseuses et du JSON compact. Un budget mesuré protège des régressions en CI.',
		},
		f3: {
			t: 'Concurrence sûre',
			b: 'Écritures atomiques, un mutex inter-processus avec jetons de propriété et mise en quarantaine de la corruption.',
		},
		f4: {
			t: 'Prêt pour le multi-agent',
			b: 'Le plugin proposals coordonne un essaim : verrous, file de tâches, disjonction des slices et notifications push.',
		},
	},
	install: {
		title: 'Installer & lancer',
		lead: 'Ajoutez-le et pointez votre client MCP vers le binaire mcp-vertex :',
		verify: "Vérifiez qu'il démarre",
		addto: 'Ajoutez-le à votre IDE / agent',
		presets: 'Presets :',
		oneCmd: 'Une commande · tout IDE',
		oneCmdNote:
			'Détecte votre IDE et ajoute mcp-vertex — sans toucher à vos autres serveurs MCP.',
		config: "Choisissez un preset (minimal · standard · swarm · full) ou listez les plugins. Lancez avec --check pour l'autodiagnostic.",
		excludeHelp:
			"Retirez des plugins de l'ensemble résolu avec --exclude-plugins= (alias : --excludePlugins=). Utile pour exclure un plugin d'un preset sans le forker — p. ex. --preset=swarm --exclude-plugins=notification pour une session à un seul agent.",
		tabsPackageManager: 'Gestionnaire de paquets',
		tabsIde: 'IDE / agent',
		tabsPreset: 'Preset',
		pmStep1Title: '1. Initialiser',
		pmStep1Body:
			'Lancez l’installateur en une commande. Il détecte votre éditeur, fusionne la configuration et affiche ce qu’il a fait.',
		pmStep2Title: '2. Vérifier',
		pmStep2Body:
			'Lancez le même gestionnaire avec `--check` pour l’autodiagnostic.',
		pmRecommend: 'Recommandé',
		ideFileLabel: 'Fichier de config',
		ideScopeLabel: 'Portée',
		ideScopeProject: 'projet',
		ideScopeGlobal: 'global',
		ideScopeBoth: 'projet / global',
		ideWhyLabel: 'Pourquoi cette forme ?',
		ideWhyBody:
			'Chaque IDE utilise une clé JSON légèrement différente (`mcpServers`, `servers`, `context_servers`) et un chemin distinct. Le rendu s’adapte automatiquement — collez-le tel quel.',
		presetSizeLabel: 'plugins',
		presetUseLabel: 'À utiliser pour',
		presetPluginsLabel: 'Plugins inclus',
		presetFoot:
			'Passez n’importe quel preset au serveur avec `--preset=<nom>`. Les presets sont additifs — combinez `--include-plugins=` et `--exclude-plugins=` pour affiner sans forker.',
		copy: 'Copier',
		copied: 'Copié !',
		faqTitle: 'Questions fréquentes',
		faqQ1: 'Pourquoi `deno run -A npm:@mcp-vertex/core` est-il lent au démarrage ?',
		faqA1: 'Deno résout et vérifie le paquet npm à la première utilisation. Les exécutions suivantes réutilisent le cache dans `~/.cache/deno`. Pour des démarrages répétés, préférez bun ou npx.',
		faqQ2: 'Mon IDE n’est pas listé — que faire ?',
		faqA2: 'Tout IDE qui accepte un serveur MCP stdio fonctionne. Prenez le JSON de VS Code, changez le chemin du fichier pour celui attendu par votre IDE, et enregistrez la même commande + arguments.',
		faqQ3: 'Puis-je exécuter plusieurs presets à la fois ?',
		faqA3: 'Non — un serveur, un preset. Pour des ensembles de plugins différents par projet, déposez un `mcp-vertex.config.json` dans ce projet et le chargeur le lit en premier.',
	},
	tools: {
		title: 'Outils',
		lead: "Tous les outils exposés par l'ensemble des plugins, groupés par namespace — extraits du registre vivant, donc cette page ne dérive jamais du code.",
		count: 'outils',
		packages: 'paquets',
	},
	bench: {
		title: 'Mesuré, pas promis',
		lead: "L'efficacité en tokens est un invariant protégé — un test CI échoue si ces plafonds régressent.",
		b1: {
			t: 'démarrage à froid',
			b: 'overview (compact) + auto_work — orientation complète en moins de 300 tokens.',
		},
		b2: {
			t: 'pas de polling',
			b: 'la libération des verrous est poussée (plugin notification), pas interrogée en boucle.',
		},
		b3: {
			t: 'protégé du drift',
			b: 'un SDK de types généré, des budgets de tokens et un filet e2e strict sur le vrai protocole.',
		},
		live: {
			title: "Coût d'orientation · mesuré en direct",
			note: "Tokens du texte que voit un agent (≈4 octets/token), mesurés en direct sur le protocole avec proposals+memory. La ligne de base est une estimation illustrative d'une orientation manuelle — pas la mesure d'un outil tiers.",
		},
		baseline: 'sans mcp-vertex (à la main · estimation)',
	},
	plugins: {
		title: 'Plugins',
		lead: 'Les paquets publiés. Ne chargez que le nécessaire ; le cœur reste minuscule.',
	},
	cfg: {
		title: 'Réglages',
		theme: 'Thème',
		language: 'Langue',
		motion: 'Animation',
		motionLabel: 'Animer les marquees',
	},
	search: {
		title: 'Rechercher',
		placeholder: 'Rechercher sur le site...',
	},
	footer: {
		built: 'Généré à partir du registre vivant des outils.',
		tagline:
			'Un noyau de serveur MCP agnostique au projet + chargeur de plugins.',
		sections: 'Sections',
		resources: 'Ressources',
		madeBy: 'Réalisé par Cartago · @CartagoGit sur GitHub',
		creatorsRepo: 'Créateur sur GitHub',
		creatorsNpm: 'Créateur sur npm',
	},
	pluginpage: {
		back: 'Retour',
		tools: 'Outils',
		install: 'Installation',
		tabInstall: 'Installation',
		tabTools: 'Outils',
		tabConfiguration: 'Configuration',
		tabTutorial: 'Tutoriel',
	},
	plugin: {
		proposals:
			"Coordination multi-agent : verrous, file de tâches, slices, round-context, réparation d'état.",
		git: 'Inspection de dépôt en lecture seule : status, fichiers modifiés, diff, log.',
		memory: 'Notes durables inter-sessions avec recall BM25, quotas, TTL et masquage des secrets.',
		search: 'Recherche peu coûteuse dans le workspace : substring ou regex, globs inclure/exclure.',
		rules: 'Détection de framework + conseils de lint/conventions ; la config du projet prime.',
		quality:
			'Lance les gates qualité (lint/test/build) avec politique allow/deny ; annulable.',
		docs: 'Catalogue et lit la doc markdown du projet, navigation curée peu coûteuse.',
		deps: 'Inventaire des dépendances hors-ligne + santé (lockfile, plages laxistes, doublons).',
		notification:
			'Pousse les événements de libération de verrou pour éviter le polling.',
		logs: 'Append-only redacted event log with query, tail and correlation tools.',
		'status-marker':
			'Marqueur de fermeture coloré obligatoire pour chaque réponse d’agent : 8 états canoniques, outils helper + validateur.',
		core: 'Le cœur agnostique : overview, scaffold, métriques, doctor et le chargeur de plugins.',
	},
	toolpage: {
		back: 'Retour',
		backToPlugin: 'Retour au plugin',
		arguments: 'Arguments',
		argName: 'Argument',
		argType: 'Type',
		argRequired: 'Requis',
		argDescription: 'Description',
		argRequiredYes: 'oui',
		argRequiredNo: 'non',
		noArguments: "Cet outil n'accepte aucun argument.",
		effects: 'Effets',
		effectReadOnly: 'lecture seule',
		example: "Exemple d'appel",
		exampleNote:
			"Affiché comme un payload générique d'appel d'outil MCP ; le transport exact dépend de votre client.",
		plugin: 'Plugin',
	},
	firstFiveMinutes: {
		title: 'Les 5 premières minutes',
		lead: 'Trois guides de démarrage à copier-coller. Choisissez celui qui correspond à la façon dont vous exécutez mcp-vertex.',
		profileTabBunNode: 'Bun / Node',
		profileTabVscode: 'VS Code / Copilot',
		profileTabClaude: 'Claude Code',
		bunNode: {
			title: 'Bun / Node — lancer le serveur directement',
			intro: "Aucune intégration d'éditeur nécessaire : lancez le host server depuis un terminal et pointez n'importe quel client MCP vers son transport stdio.",
			steps: [
				'Installer : `bun add @mcp-vertex/core` (ou `npm install @mcp-vertex/core`).',
				'Lancer : `bunx mcp-vertex --preset=standard` (ou `npx mcp-vertex --preset=standard`).',
				"Vérifier : le processus affiche la liste des plugins chargés et attend sur stdio — Ctrl+C pour l'arrêter.",
				'Pointez la config de votre client MCP vers le binaire avec `--preset=minimal|standard|swarm|full` (voir Installer pour la liste complète des flags).',
				'Appelez `mcp-vertex_overview { compact: true }` en premier — il vous dit quoi faire ensuite.',
			],
		},
		vscode: {
			title: 'VS Code / GitHub Copilot',
			intro: "L'installateur en une commande détecte VS Code et ajoute mcp-vertex à votre liste de serveurs MCP sans toucher aux serveurs existants.",
			steps: [
				"Lancez l'installateur en une commande depuis la page Installer (détecte votre IDE automatiquement).",
				'Rechargez la fenêtre (`Developer: Reload Window`) pour que Copilot prenne en compte le nouveau serveur.',
				"Ouvrez le panneau de chat Copilot et sélectionnez l'agent `mcp-vertex` dans le sélecteur d'agents.",
				'Demandez-lui d’appeler `mcp-vertex_overview` — il doit indiquer le preset chargé et une action recommandée.',
				'Si le serveur n’apparaît pas, consultez Dépannage → "MCP server not detected".',
			],
		},
		claude: {
			title: 'Claude Code',
			intro: "Claude Code lit `.mcp.json` à la racine du workspace ; l'installateur écrit ou fusionne ce fichier pour vous.",
			steps: [
				"Lancez l'installateur en une commande — il détecte Claude Code et écrit `.mcp.json`.",
				'Redémarrez Claude Code (ou lancez `/mcp` pour recharger les serveurs) pour qu’il prenne en compte la nouvelle entrée.',
				'Dans une session neuve, les fichiers toujours chargés `AGENTS.md` + `CLAUDE.md` pointent déjà vers `mcp-vertex_overview` comme premier appel.',
				'Confirmez avec `mcp-vertex_overview { compact: true }` — le champ `recommendedNextAction` vous dit quoi faire ensuite.',
				'Pour les sessions multi-agent, lisez le skill `proposal-swarm-runner` avant de réclamer un slice.',
			],
		},
		nextSteps: 'Où aller ensuite',
		nextToolsCta: 'Parcourir tous les outils',
		nextTroubleshootingCta: 'Quelque chose ne fonctionne pas ? Dépannage',
	},
	troubleshooting: {
		title: 'Dépannage',
		lead: 'Symptôme → cause probable → solution, pour les problèmes réellement signalés.',
		symptom: 'Symptôme',
		cause: 'Cause probable',
		fix: 'Solution',
		tags: 'Tags',
		backToIndex: 'Retour au dépannage',
		closedBy: 'Clos par',
		empty: 'Aucun cas de dépannage ne correspond encore à ce filtre.',
	},
	knowledge: {
		title: 'Connaissances',
		lead: 'Documents catalogués sur lesquels le cœur peut répondre à des questions.',
		count: 'documents',
	},
	prompts: {
		title: 'Prompts',
		lead: 'Modèles de prompts réutilisables exposés par le cœur.',
		count: 'prompts',
		arg: 'arguments',
	},
	resources: {
		title: 'Ressources',
		lead: 'Ressources statiques livrées avec le projet (URI + MIME).',
		count: 'ressources',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Compétences',
		lead: 'Guides de domaine que l’agent peut charger à la demande.',
		count: 'compétences',
		body: 'Corps',
	},
	notFound: {
		code: '404',
		title: 'Page introuvable',
		lead: "La page que vous cherchez n'existe pas ou a été déplacée. Le cœur reste agnostique — même des URL cassées.",
		homeCta: "Retour à l'accueil",
		toolsCta: 'Voir les outils',
		homeAria: "Aller à l'accueil",
	},
	proposals: proposals,
	recovery: recovery,
	logs: logs,
	presets: {
		title: 'Presets',
		lead: 'Ensembles de plugins préconfigurés pour différentes tailles d’espace de travail.',
		summary:
			'Ce dépôt contient {count} plugins uniques à travers les presets.',
		hostOnlyChip: 'hôte uniquement',
		installTitle: 'Comment utiliser',
		installLead:
			'Spécifiez le drapeau --preset lors del démarrage du serveur MCP.',
		table: {
			preset: 'Preset',
		},
	},
	ui: {
		codeCopy: 'Copier',
		codeCopied: 'Copié !',
		codeCollapse: 'Replier',
		codeExpand: 'Déployer',
		calloutNote: 'Note',
		calloutTip: 'Astuce',
		calloutWarn: 'Attention',
		calloutDanger: 'Danger',
		tabsNext: 'Suivant',
		tabsPrev: 'Précédent',
		stepsOf: 'de',
	},
};

const extension = {
	overviewTitle: 'Vue d ensemble mcp-vertex',
	refresh: 'mcp-vertex: Actualiser',
	runValidation: 'mcp-vertex: Lancer la validation',
	openProposalBoard: 'mcp-vertex: Ouvrir le tableau des propositions',
	showMetrics: 'mcp-vertex: Afficher les metriques',
	toolsView: 'Outils mcp-vertex',
	proposalsView: 'Propositions mcp-vertex',
	statusTooltip: 'statut mcp-vertex',
	openDashboard: 'mcp-vertex: Ouvrir le tableau de bord',
	openDocs: 'mcp-vertex: Ouvrir la documentation',
	tabOverview: 'Apercu',
	tabMetrics: 'Metriques',
	tabTokens: 'Tokens',
	tabTools: 'Outils',
	tabPlugins: 'Plugins',
	tabSessions: 'Sessions',
	tabTimes: 'Temps',
	tabAgents: 'Agents',
	tabDocs: 'Docs',
	kpiTools: 'Outils',
	kpiPlugins: 'Plugins',
	kpiProposals: 'Propositions',
	kpiCalls: 'Appels',
	kpiTokens: 'Tokens',
	kpiSaved: 'Epargnes',
	kpiWall: 'Temps total',
	kpiAgents: 'Agents',
	refreshDashboard: 'Actualiser le tableau de bord',
	docsUrlRejected: 'mcp-vertex: URL de docs rejetee',
	openKnowledge: 'mcp-vertex: Ouvrir le navigateur de connaissances',
	toolSearch: 'mcp-vertex: Rechercher des outils',
	restartServer: 'mcp-vertex: Redemarrer le serveur MCP',
	openSettings: 'mcp-vertex: Ouvrir les reglages',
	memorySave: 'mcp-vertex: Enregistrer une note memoire',
	memoryForget: 'mcp-vertex: Oublier une note memoire',
	tabHealth: 'Sante',
	healthHealthy: 'Sain',
	healthDegraded: 'Degrade',
	healthLocks: 'Verrous',
	healthStale: 'Agents inactifs',
	healthQueue: 'File',
	serverRestartHint:
		'mcp-vertex: veuillez redemarrer l extension pour relancer le serveur MCP.',
	openLogsToday: "mcp-vertex: Open Today's Log", // TODO(i18n): translate to this locale
	gitStatus: 'mcp-vertex: Git Status', // TODO(i18n): translate to this locale
	openMemory: 'mcp-vertex: Open Memory Search', // TODO(i18n): translate to this locale
	notificationTest: 'mcp-vertex: Test Notification', // TODO(i18n): translate to this locale
	depsCheck: 'mcp-vertex: Check Dependencies', // TODO(i18n): translate to this locale
	webFetch: 'mcp-vertex: Web Fetch', // TODO(i18n): translate to this locale
	toolbarCategoryProposals: 'Proposals', // TODO(i18n): translate to this locale
	toolbarCategoryKnowledge: 'Knowledge', // TODO(i18n): translate to this locale
	toolbarCategoryLogs: 'Journaux',
	toolbarCategoryDocs: 'Docs', // TODO(i18n): translate to this locale
	toolbarCategoryQuality: 'Quality', // TODO(i18n): translate to this locale
	toolbarCategoryGit: 'Git', // TODO(i18n): translate to this locale
	toolbarCategoryMemory: 'Memory', // TODO(i18n): translate to this locale
	toolbarCategoryNotification: 'Notifications', // TODO(i18n): translate to this locale
	toolbarCategoryDeps: 'Dependencies', // TODO(i18n): translate to this locale
	toolbarCategoryTools: 'Tools', // TODO(i18n): translate to this locale
	setupGithub: 'mcp-vertex : Configurer les issues GitHub',
};

const dict: ILangDict = {
	site: site as unknown as ILangDict['site'],
	extension: extension as unknown as ILangDict['extension'],
	tools: {},
};

export default dict;
