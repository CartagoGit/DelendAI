import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'Concept',
		install: 'Installer',
		tools: 'Outils',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		github: 'GitHub',
		menu: 'Menu',
		knowledge: 'Connaissances',
		prompts: 'Prompts',
		resources: 'Ressources',
		skills: 'Compétences',
		guide: 'Guide',
		more: 'Plus',
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
		config: "Choisissez un preset (minimal · standard · swarm) ou listez les plugins. Lancez avec --check pour l'autodiagnostic.",
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
};

export default dict;
