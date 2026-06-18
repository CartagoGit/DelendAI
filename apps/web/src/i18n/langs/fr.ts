import type { Dict } from "../shared";

const dict: Dict = {
	"nav.concept": "Concept",
	"nav.install": "Installer",
	"nav.tools": "Outils",
	"nav.benchmarks": "Benchmarks",
	"nav.plugins": "Plugins",
	"nav.github": "GitHub",
	"hero.title.a": "Le ",
	"hero.title.b": "MCP Vertex",
	"hero.title.c": " agnostique",
	"hero.subheader": "Un cœur de serveur MCP + chargeur de plugins pour tout projet.",
	"hero.tagline":
		"Un cœur de serveur Model Context Protocol agnostique au projet. Le cœur ne sait rien de votre domaine — les capacités arrivent sous forme de plugins que vous chargez à la demande, toutes mesurées pour un faible coût en tokens.",
	"hero.ctaInstall": "Commencer",
	"hero.ctaTools": "Voir les outils",
	"hero.runsOn": "Fonctionne sous Node, Deno et bun · tout gestionnaire de paquets",
	"marquee.runtimes": "Construit avec · tourne sous",
	"marquee.clients": "Clients MCP & modèles",
	"concept.title": "Un petit cœur, beaucoup de plugins",
	"concept.body":
		"mcp-vertex est le cœur hermétique : enregistrement déterministe des outils, chemins de workspace injectés, un chargeur de plugins en CLI et une surface d'outils mesurée en tokens. Tout ce qui est spécifique au domaine est un plugin — ne chargez que ce dont vous avez besoin, sous n'importe quel hôte ou modèle.",
	"concept.f1.t": "Agnostique au projet",
	"concept.f1.b":
		"Aucun code métier dans le cœur. Le même plugin se comporte de façon identique sous n'importe quel hôte ou modèle.",
	"concept.f2.t": "Peu de tokens par conception",
	"concept.f2.b":
		"Un seul overview, des connaissances paresseuses et du JSON compact. Un budget mesuré protège des régressions en CI.",
	"concept.f3.t": "Concurrence sûre",
	"concept.f3.b":
		"Écritures atomiques, un mutex inter-processus avec jetons de propriété et mise en quarantaine de la corruption.",
	"concept.f4.t": "Prêt pour le multi-agent",
	"concept.f4.b":
		"Le plugin proposals coordonne un essaim : verrous, file de tâches, disjonction des slices et notifications push.",
	"install.title": "Installer & lancer",
	"install.lead": "Ajoutez-le et pointez votre client MCP vers le binaire mcp-vertex :",
	"install.verify": "Vérifiez qu'il démarre",
	"install.addto": "Ajoutez-le à votre IDE / agent",
	"install.presets": "Presets :",
	"install.oneCmd": "Une commande · tout IDE",
	"install.oneCmdNote": "Détecte votre IDE et ajoute mcp-vertex — sans toucher à vos autres serveurs MCP.",
	"install.config":
		"Choisissez un preset (minimal · standard · swarm) ou listez les plugins. Lancez avec --check pour l'autodiagnostic.",
	"tools.title": "Outils",
	"tools.lead":
		"Tous les outils exposés par l'ensemble des plugins, groupés par namespace — extraits du registre vivant, donc cette page ne dérive jamais du code.",
	"tools.count": "outils",
	"tools.packages": "paquets",
	"bench.title": "Mesuré, pas promis",
	"bench.lead":
		"L'efficacité en tokens est un invariant protégé — un test CI échoue si ces plafonds régressent.",
	"bench.b1.t": "démarrage à froid",
	"bench.b1.b":
		"overview (compact) + auto_work — orientation complète en moins de 300 tokens.",
	"bench.b2.t": "pas de polling",
	"bench.b2.b":
		"la libération des verrous est poussée (plugin notification), pas interrogée en boucle.",
	"bench.b3.t": "protégé du drift",
	"bench.b3.b":
		"un SDK de types généré, des budgets de tokens et un filet e2e strict sur le vrai protocole.",
	"bench.live.title": "Coût d'orientation · mesuré en direct",
	"bench.live.note":
		"Tokens du texte que voit un agent (≈4 octets/token), mesurés en direct sur le protocole avec proposals+memory. La ligne de base est une estimation illustrative d'une orientation manuelle — pas la mesure d'un outil tiers.",
	"bench.baseline": "sans mcp-vertex (à la main · estimation)",
	"plugins.title": "Plugins",
	"plugins.lead":
		"Les paquets publiés. Ne chargez que le nécessaire ; le cœur reste minuscule.",
	"cfg.title": "Réglages",
	"cfg.theme": "Thème",
	"cfg.language": "Langue",
	"cfg.motion": "Animation",
	"cfg.motionLabel": "Animer les marquees",
	"footer.built": "Généré à partir du registre vivant des outils.",
	"pluginpage.back": "Retour",
	"pluginpage.tools": "Outils",
	"pluginpage.install": "Installation",
	"plugin.proposals":
		"Coordination multi-agent : verrous, file de tâches, slices, round-context, réparation d'état.",
	"plugin.git": "Inspection de dépôt en lecture seule : status, fichiers modifiés, diff, log.",
	"plugin.memory":
		"Notes durables inter-sessions avec recall BM25, quotas, TTL et masquage des secrets.",
	"plugin.search": "Recherche peu coûteuse dans le workspace : substring ou regex, globs inclure/exclure.",
	"plugin.rules": "Détection de framework + conseils de lint/conventions ; la config du projet prime.",
	"plugin.quality":
		"Lance les gates qualité (lint/test/build) avec politique allow/deny ; annulable.",
	"plugin.docs":
		"Catalogue et lit la doc markdown du projet, navigation curée peu coûteuse.",
	"plugin.deps":
		"Inventaire des dépendances hors-ligne + santé (lockfile, plages laxistes, doublons).",
	"plugin.notification":
		"Pousse les événements de libération de verrou pour éviter le polling.",
	"plugin.core":
		"Le cœur agnostique : overview, scaffold, métriques, doctor et le chargeur de plugins.",
};

export default dict;
export { dict };