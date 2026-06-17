export const languages = { en: 'English', es: 'Español' } as const;
export type Lang = keyof typeof languages;
export const defaultLang: Lang = 'en';

/** UI strings per language. Keep keys flat and stable. */
export const ui = {
	en: {
		'nav.concept': 'Concept',
		'nav.install': 'Install',
		'nav.tools': 'Tools',
		'nav.benchmarks': 'Benchmarks',
		'nav.github': 'GitHub',
		'hero.tagline':
			'A project-agnostic Model Context Protocol server core. The core knows nothing about your domain — capabilities ship as plugins you load on demand.',
		'hero.ctaInstall': 'Get started',
		'hero.ctaTools': 'Browse the tools',
		'hero.runsOn': 'Runs under Node, Deno & bun · any package manager',
		'marquee.runtimes': 'Runtimes & package managers',
		'marquee.clients': 'MCP clients & models',
		'concept.title': 'One small core, many plugins',
		'concept.body':
			'mcp-core is the hermetic core: deterministic tool registration, injected workspace paths, a CLI plugin loader and a token-measured tool surface. Everything domain-specific is a plugin — load only what you need.',
		'concept.f1.t': 'Project-agnostic',
		'concept.f1.b': 'No domain code in the core. The same plugin behaves identically under any host or model.',
		'concept.f2.t': 'Low-token by design',
		'concept.f2.b': 'Single overview, lazy knowledge, compact JSON. A measured budget guards regressions in CI.',
		'concept.f3.t': 'Safe concurrency',
		'concept.f3.b': 'Atomic writes, a cross-process mutex with ownership tokens, and corruption quarantine.',
		'concept.f4.t': 'Multi-agent ready',
		'concept.f4.b': 'The proposals plugin coordinates a swarm: locks, a task queue, slice disjointness, push notifications.',
		'install.title': 'Install & run',
		'install.lead': 'Add it and point your MCP client at the `mcp-core` binary:',
		'install.config': 'Pick a preset (minimal · standard · swarm) or list plugins explicitly. Run with --check to self-diagnose.',
		'tools.title': 'Tools',
		'tools.lead': 'Every tool the full plugin set exposes, grouped by namespace — harvested from the live registry, so this page never drifts from the code.',
		'tools.count': 'tools',
		'tools.packages': 'packages',
		'bench.title': 'Measured, not claimed',
		'bench.lead': 'Token efficiency is a guarded invariant — a CI test fails if these ceilings regress.',
		'bench.b1.t': 'cold-start',
		'bench.b1.b': 'overview (compact) + auto_work — full orientation under 300 tokens.',
		'bench.b2.t': 'no polling',
		'bench.b2.b': 'lock-release is pushed (notification plugin), not polled in a loop.',
		'bench.b3.t': 'drift-guarded',
		'bench.b3.b': 'generated type SDK + token budgets + a strict e2e net over the real protocol.',
		'footer.built': 'Generated from the live tool registry.',
	},
	es: {
		'nav.concept': 'Concepto',
		'nav.install': 'Instalar',
		'nav.tools': 'Herramientas',
		'nav.benchmarks': 'Benchmarks',
		'nav.github': 'GitHub',
		'hero.tagline':
			'Un núcleo de servidor Model Context Protocol agnóstico al proyecto. El núcleo no sabe nada de tu dominio — las capacidades llegan como plugins que cargas a demanda.',
		'hero.ctaInstall': 'Empezar',
		'hero.ctaTools': 'Ver las herramientas',
		'hero.runsOn': 'Corre en Node, Deno y bun · cualquier gestor de paquetes',
		'marquee.runtimes': 'Runtimes y gestores de paquetes',
		'marquee.clients': 'Clientes MCP y modelos',
		'concept.title': 'Un núcleo pequeño, muchos plugins',
		'concept.body':
			'mcp-core es el núcleo hermético: registro determinista de herramientas, rutas de workspace inyectadas, un cargador de plugins por CLI y una superficie de herramientas medida en tokens. Todo lo específico del dominio es un plugin — carga solo lo que necesitas.',
		'concept.f1.t': 'Agnóstico al proyecto',
		'concept.f1.b': 'Sin código de dominio en el núcleo. El mismo plugin se comporta igual bajo cualquier host o modelo.',
		'concept.f2.t': 'Pocos tokens por diseño',
		'concept.f2.b': 'Un solo overview, conocimiento perezoso, JSON compacto. Un presupuesto medido protege de regresiones en CI.',
		'concept.f3.t': 'Concurrencia segura',
		'concept.f3.b': 'Escrituras atómicas, un mutex inter-proceso con tokens de propiedad y cuarentena de corrupción.',
		'concept.f4.t': 'Listo para multi-agente',
		'concept.f4.b': 'El plugin proposals coordina un swarm: locks, cola de tareas, disjunción de slices, notificaciones push.',
		'install.title': 'Instalar y ejecutar',
		'install.lead': 'Añádelo y apunta tu cliente MCP al binario `mcp-core`:',
		'install.config': 'Elige un preset (minimal · standard · swarm) o lista plugins explícitamente. Ejecuta con --check para autodiagnóstico.',
		'tools.title': 'Herramientas',
		'tools.lead': 'Todas las herramientas que expone el set completo de plugins, agrupadas por namespace — extraídas del registro vivo, así esta página nunca se desincroniza del código.',
		'tools.count': 'herramientas',
		'tools.packages': 'paquetes',
		'bench.title': 'Medido, no prometido',
		'bench.lead': 'La eficiencia de tokens es un invariante protegido — un test de CI falla si estos techos regresan.',
		'bench.b1.t': 'arranque en frío',
		'bench.b1.b': 'overview (compacto) + auto_work — orientación completa en menos de 300 tokens.',
		'bench.b2.t': 'sin polling',
		'bench.b2.b': 'la liberación de locks se notifica (plugin notification), no se consulta en bucle.',
		'bench.b3.t': 'protegido contra drift',
		'bench.b3.b': 'SDK de tipos generado + presupuestos de tokens + red e2e estricta sobre el protocolo real.',
		'footer.built': 'Generado a partir del registro vivo de herramientas.',
	},
} as const;

export const useTranslations = (lang: Lang) => {
	const dict = ui[lang];
	return (key: keyof (typeof ui)['en']): string => dict[key] ?? ui[defaultLang][key];
};
