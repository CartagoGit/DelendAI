import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'Concepto',
		install: 'Instalar',
		tools: 'Herramientas',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		presets: 'Presets',
		github: 'GitHub',
		menu: 'Menú',
		knowledge: 'Conocimiento',
		prompts: 'Prompts',
		resources: 'Recursos',
		skills: 'Skills',
		guide: 'Guía',
		more: 'Más',
		firstFiveMinutes: 'Primeros 5 minutos',
		troubleshooting: 'Solución de problemas',
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
		excludeHelp:
			'Quita plugins del conjunto resuelto con --exclude-plugins= (alias: --excludePlugins=). Útil para descartar un plugin de un preset sin fork — p. ej. --preset=swarm --exclude-plugins=notification para una sesión de un solo agente.',
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
	search: {
		title: 'Buscar',
		placeholder: 'Buscar en el sitio...',
	},
	footer: {
		built: 'Generado a partir del registro vivo de herramientas.',
		tagline:
			'Un núcleo de servidor MCP agnóstico al proyecto + cargador de plugins.',
		sections: 'Secciones',
		resources: 'Recursos',
		madeBy: 'Hecho por Cartago · @CartagoGit en GitHub',
		creatorsRepo: 'Creador en GitHub',
		creatorsNpm: 'Creador en npm',
	},
	pluginpage: {
		back: 'Volver',
		tools: 'Herramientas',
		install: 'Instalación',
		tabInstall: 'Instalación',
		tabTools: 'Herramientas',
		tabConfiguration: 'Configuración',
		tabTutorial: 'Tutorial',
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
		logs: 'Log redactado append-only con herramientas de query, tail y correlación.',
		'status-marker':
			'Cierre obligatorio coloreado para cada respuesta del agente: 8 estados canónicos, herramientas helper + validador.',
		core: 'El núcleo agnóstico: overview, scaffold, métricas, doctor y el cargador de plugins.',
	},
	toolpage: {
		back: 'Volver',
		backToPlugin: 'Volver al plugin',
		arguments: 'Argumentos',
		argName: 'Argumento',
		argType: 'Tipo',
		argRequired: 'Obligatorio',
		argDescription: 'Descripción',
		argRequiredYes: 'sí',
		argRequiredNo: 'no',
		noArguments: 'Esta herramienta no recibe argumentos.',
		effects: 'Efectos',
		effectReadOnly: 'solo lectura',
		example: 'Llamada de ejemplo',
		exampleNote:
			'Se muestra como un payload genérico de llamada a herramienta MCP; el transporte exacto depende de tu cliente.',
		plugin: 'Plugin',
	},
	firstFiveMinutes: {
		title: 'Primeros 5 minutos',
		lead: 'Tres guías rápidas para copiar y pegar. Elige la que coincide con cómo ejecutas mcp-vertex.',
		profileTabBunNode: 'Bun / Node',
		profileTabVscode: 'VS Code / Copilot',
		profileTabClaude: 'Claude Code',
		bunNode: {
			title: 'Bun / Node — ejecuta el servidor directamente',
			intro: 'Sin integración de editor: ejecuta el host server desde una terminal y apunta cualquier cliente MCP a su transporte stdio.',
			steps: [
				'Instala: `bun add @mcp-vertex/core` (o `npm install @mcp-vertex/core`).',
				'Ejecuta: `bunx mcp-vertex --preset=standard` (o `npx mcp-vertex --preset=standard`).',
				'Verifica: el proceso imprime la lista de plugins cargados y espera en stdio — Ctrl+C para detenerlo.',
				'Apunta la configuración de tu cliente MCP al binario con `--preset=minimal|standard|swarm` (ver Instalar para la lista completa de flags).',
				'Llama primero a `mcp-vertex_overview { compact: true }` — te dice qué hacer a continuación.',
			],
		},
		vscode: {
			title: 'VS Code / GitHub Copilot',
			intro: 'El instalador de un solo comando detecta VS Code y añade mcp-vertex a tu lista de servidores MCP sin tocar los existentes.',
			steps: [
				'Ejecuta el instalador de un solo comando desde la página de Instalación (detecta tu IDE).',
				'Recarga la ventana (`Developer: Reload Window`) para que Copilot reconozca el nuevo servidor.',
				'Abre el panel de chat de Copilot y selecciona el agente `mcp-vertex` en el selector de agentes.',
				'Pídele que llame a `mcp-vertex_overview` — debería reportar el preset cargado y una acción recomendada.',
				'Si el servidor no aparece, consulta Solución de problemas → "MCP server not detected".',
			],
		},
		claude: {
			title: 'Claude Code',
			intro: 'Claude Code lee `.mcp.json` en la raíz del workspace; el instalador escribe o fusiona ese archivo por ti.',
			steps: [
				'Ejecuta el instalador de un solo comando — detecta Claude Code y escribe `.mcp.json`.',
				'Reinicia Claude Code (o ejecuta `/mcp` para recargar servidores) para que reconozca la nueva entrada.',
				'En una sesión nueva, los `AGENTS.md` + `CLAUDE.md` siempre cargados ya apuntan a `mcp-vertex_overview` como primera llamada.',
				'Confirma con `mcp-vertex_overview { compact: true }` — el campo `recommendedNextAction` te dice qué hacer a continuación.',
				'Para sesiones multi-agente, lee el skill `proposal-swarm-runner` antes de reclamar un slice.',
			],
		},
		nextSteps: 'Hacia dónde seguir',
		nextToolsCta: 'Ver todas las herramientas',
		nextTroubleshootingCta: '¿Algo no funciona? Solución de problemas',
	},
	troubleshooting: {
		title: 'Solución de problemas',
		lead: 'Síntoma → causa probable → solución, para los problemas que realmente se han reportado.',
		symptom: 'Síntoma',
		cause: 'Causa probable',
		fix: 'Solución',
		tags: 'Etiquetas',
		backToIndex: 'Volver a solución de problemas',
		closedBy: 'Cerrado por',
		empty: 'Ningún caso de solución de problemas coincide con este filtro todavía.',
	},
	knowledge: {
		title: 'Conocimiento',
		lead: 'Documentos catalogados sobre los que el núcleo puede responder preguntas.',
		count: 'documentos',
	},
	prompts: {
		title: 'Prompts',
		lead: 'Plantillas de prompts reutilizables que expone el núcleo.',
		count: 'prompts',
		arg: 'argumentos',
	},
	resources: {
		title: 'Recursos',
		lead: 'Recursos estáticos agrupados con el proyecto (URI + MIME).',
		count: 'recursos',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Skills',
		lead: 'Manuales de dominio que el agente puede cargar bajo demanda.',
		count: 'skills',
		body: 'Cuerpo',
	},
	notFound: {
		code: '404',
		title: 'Página no encontrada',
		lead: 'La página que buscas no existe o se ha movido. El núcleo se mantiene agnóstico — incluso de las URLs rotas.',
		homeCta: 'Volver al inicio',
		toolsCta: 'Ver las herramientas',
		homeAria: 'Ir al inicio',
	},
	proposals: proposalGlossaryByLang.es,
	recovery: recoveryByLang.es,
	logs: logsByLang.es,
};

export default dict;
