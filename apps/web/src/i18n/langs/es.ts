import type { Dict } from "../shared";

const dict: Dict = {
	"nav.concept": "Concepto",
	"nav.install": "Instalar",
	"nav.tools": "Herramientas",
	"nav.benchmarks": "Benchmarks",
	"nav.plugins": "Plugins",
	"nav.github": "GitHub",
	"hero.title.a": "El ",
	"hero.title.b": "MCP Vertex",
	"hero.title.c": " agnóstico",
	"hero.subheader": "Un núcleo de servidor MCP + cargador de plugins para cualquier proyecto.",
	"hero.tagline":
		"Un núcleo de servidor Model Context Protocol agnóstico al proyecto. El núcleo no sabe nada de tu dominio — las capacidades llegan como plugins que cargas a demanda, todas medidas para gastar pocos tokens.",
	"hero.ctaInstall": "Empezar",
	"hero.ctaTools": "Ver las herramientas",
	"hero.runsOn": "Corre en Node, Deno y bun · cualquier gestor de paquetes",
	"marquee.runtimes": "Construido con · corre en",
	"marquee.clients": "Clientes MCP y modelos",
	"concept.title": "Un núcleo pequeño, muchos plugins",
	"concept.body":
		"mcp-vertex es el núcleo hermético: registro determinista de herramientas, rutas de workspace inyectadas, un cargador de plugins por CLI y una superficie de herramientas medida en tokens. Todo lo específico del dominio es un plugin — carga solo lo que necesitas, bajo cualquier host o modelo.",
	"concept.f1.t": "Agnóstico al proyecto",
	"concept.f1.b": "Sin código de dominio en el núcleo. El mismo plugin se comporta igual bajo cualquier host o modelo.",
	"concept.f2.t": "Pocos tokens por diseño",
	"concept.f2.b":
		"Un solo overview, conocimiento perezoso y JSON compacto. Un presupuesto medido protege de regresiones en CI.",
	"concept.f3.t": "Concurrencia segura",
	"concept.f3.b":
		"Escrituras atómicas, un mutex inter-proceso con tokens de propiedad y cuarentena de corrupción.",
	"concept.f4.t": "Listo para multi-agente",
	"concept.f4.b":
		"El plugin proposals coordina un swarm: locks, cola de tareas, disjunción de slices y notificaciones push.",
	"install.title": "Instalar y ejecutar",
	"install.lead": "Añádelo y apunta tu cliente MCP al binario mcp-vertex:",
	"install.verify": "Verifica que arranca",
	"install.addto": "Añádelo a tu IDE / agente",
	"install.presets": "Presets:",
	"install.oneCmd": "Un comando · cualquier IDE",
	"install.oneCmdNote": "Detecta tu IDE y añade mcp-vertex — nunca toca tus otros servidores MCP.",
	"install.config":
		"Elige un preset (minimal · standard · swarm) o lista plugins explícitamente. Ejecuta con --check para autodiagnóstico.",
	"tools.title": "Herramientas",
	"tools.lead":
		"Todas las herramientas del set completo de plugins, agrupadas por namespace — extraídas del registro vivo, así esta página nunca se desincroniza del código.",
	"tools.count": "herramientas",
	"tools.packages": "paquetes",
	"bench.title": "Medido, no prometido",
	"bench.lead":
		"La eficiencia de tokens es un invariante protegido — un test de CI falla si estos techos regresan.",
	"bench.b1.t": "arranque en frío",
	"bench.b1.b": "overview (compacto) + auto_work — orientación completa en menos de 300 tokens.",
	"bench.b2.t": "sin polling",
	"bench.b2.b":
		"la liberación de locks se notifica (plugin notification), no se consulta en bucle.",
	"bench.b3.t": "protegido contra drift",
	"bench.b3.b":
		"un SDK de tipos generado, presupuestos de tokens y una red e2e estricta sobre el protocolo real.",
	"bench.live.title": "Coste de orientación · medido en vivo",
	"bench.live.note":
		"Tokens del texto que ve un agente (≈4 bytes/token), medidos en vivo sobre el protocolo con proposals+memory. La línea base es una estimación ilustrativa de orientarse a mano — no es la medición de un producto de terceros.",
	"bench.baseline": "sin mcp-vertex (a mano · estimado)",
	"plugins.title": "Plugins",
	"plugins.lead": "Los paquetes publicados. Carga solo lo que necesites; el núcleo se mantiene mínimo.",
	"cfg.title": "Ajustes",
	"cfg.theme": "Tema",
	"cfg.language": "Idioma",
	"cfg.motion": "Movimiento",
	"cfg.motionLabel": "Animar las marquesinas",
	"footer.built": "Generado a partir del registro vivo de herramientas.",
	"pluginpage.back": "Volver",
	"pluginpage.tools": "Herramientas",
	"pluginpage.install": "Instalación",
	"plugin.proposals":
		"Coordinación multi-agente: locks, cola de tareas, slices, round-context, reparación de estado.",
	"plugin.git": "Inspección de repositorio de solo lectura: status, cambios, diff, log.",
	"plugin.memory": "Notas duraderas entre sesiones con recall BM25, cuotas, TTL y redacción de secretos.",
	"plugin.search": "Búsqueda de bajo coste en el workspace: substring o regex, globs de inclusión/exclusión.",
	"plugin.rules": "Detección de framework + guía de lint/convenciones; la config del proyecto manda.",
	"plugin.quality": "Ejecuta gates de calidad (lint/test/build) con política allow/deny; cancelable.",
	"plugin.docs": "Cataloga y lee la documentación markdown del proyecto, navegación curada de bajo coste.",
	"plugin.deps": "Inventario de dependencias offline + salud (lockfile, rangos laxos, duplicados).",
	"plugin.notification": "Notifica la liberación de locks para que los agentes dejen de hacer polling.",
	"plugin.core": "El núcleo agnóstico: overview, scaffold, métricas, doctor y el cargador de plugins.",
};

export default dict;
export { dict };