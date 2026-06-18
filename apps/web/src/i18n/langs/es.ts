import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: 'Concepto',
		install: 'Instalar',
		tools: 'Herramientas',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		github: 'GitHub',
	},
	hero: {
		title: { a: 'El ', b: 'MCP Vertex', c: ' agnóstico' },
		subheader:
			'Un núcleo de servidor MCP + cargador de plugins para cualquier proyecto.',
		tagline:
			'Un núcleo de servidor Model Context Protocol agnóstico al proyecto. El núcleo no sabe nada de tu dominio — las capacidades llegan como plugins que cargas a demanda, todas medidas para gastar pocos tokens.',
		ctaInstall: 'Empezar',
		ctaTools: 'Ver las herramientas',
		runsOn: 'Corre en Node, Deno y bun · cualquier gestor de paquetes',
	},
	marquee: {
		runtimes: 'Construido con · corre en',
		clients: 'Clientes MCP y modelos',
	},
	concept: {
		title: 'Un núcleo pequeño, muchos plugins',
		body: 'mcp-vertex es el núcleo hermético: registro determinista de herramientas, rutas de workspace inyectadas, un cargador de plugins por CLI y una superficie de herramientas medida en tokens. Todo lo específico del dominio es un plugin — carga solo lo que necesitas, bajo cualquier host o modelo.',
		f1: {
			t: 'Agnóstico al proyecto',
			b: 'Sin código de dominio en el núcleo. El mismo plugin se comporta igual bajo cualquier host o modelo.',
		},
		f2: {
			t: 'Pocos tokens por diseño',
			b: 'Un solo overview, conocimiento perezoso y JSON compacto. Un presupuesto medido protege de regresiones en CI.',
		},
		f3: {
			t: 'Concurrencia segura',
			b: 'Escrituras atómicas, un mutex inter-proceso con tokens de propiedad y cuarentena de corrupción.',
		},
		f4: {
			t: 'Listo para multi-agente',
			b: 'El plugin proposals coordina un swarm: locks, cola de tareas, disjunción de slices y notificaciones push.',
		},
	},
	install: {
		title: 'Instalar y ejecutar',
		lead: 'Añádelo y apunta tu cliente MCP al binario mcp-vertex:',
		verify: 'Verifica que arranca',
		addto: 'Añádelo a tu IDE / agente',
		presets: 'Presets:',
		oneCmd: 'Un comando · cualquier IDE',
		oneCmdNote:
			'Detecta tu IDE y añade mcp-vertex — nunca toca tus otros servidores MCP.',
		config: 'Elige un preset (minimal · standard · swarm) o lista plugins explícitamente. Ejecuta con --check para autodiagnóstico.',
	},
	tools: {
		title: 'Herramientas',
		lead: 'Todas las herramientas del set completo de plugins, agrupadas por namespace — extraídas del registro vivo, así esta página nunca se desincroniza del código.',
		count: 'herramientas',
		packages: 'paquetes',
	},
	bench: {
		title: 'Medido, no prometido',
		lead: 'La eficiencia de tokens es un invariante protegido — un test de CI falla si estos techos regresan.',
		b1: {
			t: 'arranque en frío',
			b: 'overview (compacto) + auto_work — orientación completa en menos de 300 tokens.',
		},
		b2: {
			t: 'sin polling',
			b: 'la liberación de locks se notifica (plugin notification), no se consulta en bucle.',
		},
		b3: {
			t: 'protegido contra drift',
			b: 'un SDK de tipos generado, presupuestos de tokens y una red e2e estricta sobre el protocolo real.',
		},
		live: {
			title: 'Coste de orientación · medido en vivo',
			note: 'Tokens del texto que ve un agente (≈4 bytes/token), medidos en vivo sobre el protocolo con proposals+memory. La línea base es una estimación ilustrativa de orientarse a mano — no es la medición de un producto de terceros.',
		},
		baseline: 'sin mcp-vertex (a mano · estimado)',
	},
	plugins: {
		title: 'Plugins',
		lead: 'Los paquetes publicados. Carga solo lo que necesites; el núcleo se mantiene mínimo.',
	},
	cfg: {
		title: 'Ajustes',
		theme: 'Tema',
		language: 'Idioma',
		motion: 'Movimiento',
		motionLabel: 'Animar las marquesinas',
	},
	footer: { built: 'Generado a partir del registro vivo de herramientas.' },
	pluginpage: {
		back: 'Volver',
		tools: 'Herramientas',
		install: 'Instalación',
	},
	plugin: {
		proposals:
			'Coordinación multi-agente: locks, cola de tareas, slices, round-context, reparación de estado.',
		git: 'Inspección de repositorio de solo lectura: status, cambios, diff, log.',
		memory: 'Notas duraderas entre sesiones con recall BM25, cuotas, TTL y redacción de secretos.',
		search: 'Búsqueda de bajo coste en el workspace: substring o regex, globs de inclusión/exclusión.',
		rules: 'Detección de framework + guía de lint/convenciones; la config del proyecto manda.',
		quality:
			'Ejecuta gates de calidad (lint/test/build) con política allow/deny; cancelable.',
		docs: 'Cataloga y lee la documentación markdown del proyecto, navegación curada de bajo coste.',
		deps: 'Inventario de dependencias offline + salud (lockfile, rangos laxos, duplicados).',
		notification:
			'Notifica la liberación de locks para que los agentes dejen de hacer polling.',
		core: 'El núcleo agnóstico: overview, scaffold, métricas, doctor y el cargador de plugins.',
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
		title: 'Página no encontrada',
		lead: 'La página que buscas no existe o se ha movido. El núcleo se mantiene agnóstico — incluso de las URLs rotas.',
		homeCta: 'Volver al inicio',
		toolsCta: 'Ver las herramientas',
		homeAria: 'Ir al inicio',
	},
};

export default dict;
