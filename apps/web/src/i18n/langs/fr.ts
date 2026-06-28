import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'Concept',
		install: 'Installer',
		setup: 'Configuration',
		capabilities: 'Capacités',
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
		issues: {
			description:
				'GitHub issues plugin — ingest, analyse and (optionally) promote to a proposal.',
			requires: 'requires',
			installSnippet: 'mcp-vertex --plugins=proposals,issues',
		},
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
				'Pour les sessions multi-agent, lisez le skill `mcp-vertex-proposal-swarm-runner` avant de réclamer un slice.',
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
	proposals: proposalGlossaryByLang.fr,
	recovery: recoveryByLang.fr,
	logs: logsByLang.fr,
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
	setup: {
		title: 'Configuration multi-projets',
		lead: 'Intégrez mcp-vertex dans n’importe quel dépôt et préparez le plugin issues de GitHub pour ce dépôt — les mêmes 7 étapes que la commande setup-github.',
		stepsTitle: 'Les 7 étapes',
		docsLinkLabel: 'Lire le guide canonique de configuration multi-projets',
		detectRepoTitle: 'Détecter le dépôt',
		detectRepoBody:
			'Lit le remote GitHub et le normalise en owner/name. Le slug détecté doit pointer vers le dépôt attendu.',
		confirmRepoTitle: 'Confirmer owner/name',
		confirmRepoBody:
			'Lancez la commande de configuration et confirmez (ou remplacez) le slug détecté avant toute écriture.',
		pickAuthTierTitle: 'Choisir le niveau d’authentification',
		pickAuthTierBody:
			'Utilisez gh quand gh auth status réussit, rest-authed quand GITHUB_TOKEN est défini, sinon rest-anon (plafonné à 60 requêtes/heure).',
		writeConfigTitle: 'Écrire la configuration',
		writeConfigBody:
			'Écrit plugins.issues.options.repo dans mcp-vertex.config.json sans toucher aux autres réglages de plugins.',
		verifyTierTitle: 'Vérifier le niveau',
		verifyTierBody:
			'Démarrez l’hôte avec le plugin issues chargé pour éprouver de bout en bout le niveau d’authentification choisi.',
		printInvocationTitle: 'Afficher l’invocation',
		printInvocationBody:
			'Ajoutez ce bloc serveur à votre mcp.json. La forme est identique pour VS Code, Cursor et Claude Code.',
		markConfiguredTitle: 'Marquer comme configuré',
		markConfiguredBody:
			'Enregistrez éventuellement que ce dépôt a déjà été configuré, afin que les exécutions ultérieures sautent les invites.',
		optionalLabel: 'optionnel',
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

	homeQuickInstall: {
		title: 'Installation rapide',
		lead: "Choisissez votre gestionnaire de paquets. La même commande fonctionne avec Node, Deno et Bun — tout le reste est sur la page d'installation.",
		tabsLabel: 'Gestionnaire de paquets',
		pms: [
			{ id: 'npm', note: 'Node Package Manager — fourni avec Node.js.' },
			{
				id: 'pnpm',
				note: 'Rapide, économe en disque, résolution stricte des dépendances.',
			},
			{ id: 'yarn', note: 'Alternative classique à npm.' },
			{
				id: 'bun',
				note: 'Runtime + gestionnaire de paquets tout-en-un — mcp-vertex est lui-même construit avec bun.',
			},
			{
				id: 'deno',
				note: 'Runtime sécurisé par défaut avec TypeScript de première classe.',
			},
		],
		recommended: 'Recommandé',
		fullCta: "Matrice d'installation complète",
	},
	homeAtAGlance: {
		title: 'Que peut-il faire ?',
		lead: "Choisissez une section. La page d'accueil oriente seulement — chaque point d'entrée a une page dédiée avec le détail complet.",
		tabsLabel: 'Sections',
		openSection: 'Ouvrir',
		panels: [
			{
				id: 'plugins',
				label: 'Plugins',
				summary:
					'Paquets publiés. Chargez uniquement ce dont vous avez besoin ; le noyau reste minimal.',
				href: 'plugins',
				icon: '/logos/plugin-proposals.svg',
			},
			{
				id: 'tools',
				label: 'Outils',
				summary:
					"Tous les outils exposés par l'ensemble complet des plugins, groupés par namespace — depuis le registre vivant.",
				href: 'tools',
				icon: '/logos/plugin-core.svg',
			},
			{
				id: 'bench',
				label: 'Benchmarks',
				summary:
					"L'efficacité en tokens est un invariant protégé — mesurée, pas promise.",
				href: 'benchmarks',
				icon: '/logos/plugin-quality.svg',
			},
			{
				id: 'skills',
				label: 'Skills',
				summary:
					"Manuels de domaine que l'agent peut charger à la demande.",
				href: 'skills',
				icon: '/logos/plugin-docs.svg',
			},
			{
				id: 'knowledge',
				label: 'Connaissance',
				summary:
					'Documents catalogués sur lesquels le noyau peut répondre.',
				href: 'knowledge',
				icon: '/logos/plugin-memory.svg',
			},
			{
				id: 'presets',
				label: 'Presets',
				summary:
					'Ensembles de plugins préconfigurés pour toute taille de workspace.',
				href: 'presets',
				icon: '/logos/plugin-search.svg',
			},
			{
				id: 'setup',
				label: 'Configuration entre projets',
				summary:
					"Branchez mcp-vertex dans n'importe quel dépôt et préparez le plugin issues.",
				href: 'setup',
				icon: '/logos/github.png',
			},
		],
	},
	cli: {
		title: 'Guide CLI',
		description:
			'Comment piloter la CLI mcpv / @mcp-vertex/core : drapeaux globaux, groupes de commandes par plugin et flux de travail courants.',
	},
	guide: {
		title: 'Guide',
		description:
			'Un guide détaillé du projet @mcp-vertex/core : concepts, installation, configuration, plugins, barrières de qualité, extension, FAQ.',
		toc: [
			'1. Introduction',
			'2. Concepts',
			'3. Installation',
			'4. Configuration',
			'5. Plugins',
			'6. Outils / Prompts / Ressources / Connaissances',
			'7. Skills',
			'8. i18n',
			'9. Barrières de qualité & multi-langue',
			'10. Extension de mcp-vertex',
			'11. Budgets de tokens',
			'12. Transitions de vue',
			'13. FAQ',
		],
	},
};

export default dict;
