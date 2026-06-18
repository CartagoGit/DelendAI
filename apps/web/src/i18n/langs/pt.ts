import type { Dict } from "../shared";

const dict: Dict = {
	"nav.concept": "Conceito",
	"nav.install": "Instalar",
	"nav.tools": "Ferramentas",
	"nav.benchmarks": "Benchmarks",
	"nav.plugins": "Plugins",
	"nav.github": "GitHub",
	"hero.title.a": "O ",
	"hero.title.b": "MCP Vertex",
	"hero.title.c": " agnóstico",
	"hero.subheader": "Um núcleo de servidor MCP + carregador de plugins para qualquer projeto.",
	"hero.tagline":
		"Um núcleo de servidor Model Context Protocol agnóstico ao projeto. O núcleo não sabe nada do seu domínio — as capacidades chegam como plugins que você carrega sob demanda, todas medidas para baixo custo de tokens.",
	"hero.ctaInstall": "Começar",
	"hero.ctaTools": "Ver as ferramentas",
	"hero.runsOn": "Roda em Node, Deno e bun · qualquer gerenciador de pacotes",
	"marquee.runtimes": "Construído com · roda em",
	"marquee.clients": "Clientes MCP e modelos",
	"concept.title": "Um núcleo pequeno, muitos plugins",
	"concept.body":
		"mcp-vertex é o núcleo hermético: registro determinístico de ferramentas, caminhos de workspace injetados, um carregador de plugins por CLI e uma superfície de ferramentas medida em tokens. Tudo específico do domínio é um plugin — carregue só o que precisa, sob qualquer host ou modelo.",
	"concept.f1.t": "Agnóstico ao projeto",
	"concept.f1.b":
		"Sem código de domínio no núcleo. O mesmo plugin se comporta igual sob qualquer host ou modelo.",
	"concept.f2.t": "Poucos tokens por design",
	"concept.f2.b":
		"Um único overview, conhecimento preguiçoso e JSON compacto. Um orçamento medido protege de regressões na CI.",
	"concept.f3.t": "Concorrência segura",
	"concept.f3.b":
		"Escritas atômicas, um mutex entre processos com tokens de propriedade e quarentena de corrupção.",
	"concept.f4.t": "Pronto para multi-agente",
	"concept.f4.b":
		"O plugin proposals coordena um swarm: locks, fila de tarefas, disjunção de slices e notificações push.",
	"install.title": "Instalar e executar",
	"install.lead": "Adicione e aponte seu cliente MCP para o binário mcp-vertex:",
	"install.verify": "Verifique que arranca",
	"install.addto": "Adicione ao seu IDE / agente",
	"install.presets": "Presets:",
	"install.oneCmd": "Um comando · qualquer IDE",
	"install.oneCmdNote": "Deteta o teu IDE e adiciona o mcp-vertex — sem tocar nos teus outros servidores MCP.",
	"install.config":
		"Escolha um preset (minimal · standard · swarm) ou liste plugins. Rode com --check para autodiagnóstico.",
	"tools.title": "Ferramentas",
	"tools.lead":
		"Todas as ferramentas do conjunto completo de plugins, agrupadas por namespace — extraídas do registro vivo, então esta página nunca diverge do código.",
	"tools.count": "ferramentas",
	"tools.packages": "pacotes",
	"bench.title": "Medido, não prometido",
	"bench.lead":
		"A eficiência de tokens é um invariante protegido — um teste de CI falha se estes tetos regredirem.",
	"bench.b1.t": "partida a frio",
	"bench.b1.b":
		"overview (compacto) + auto_work — orientação completa em menos de 300 tokens.",
	"bench.b2.t": "sem polling",
	"bench.b2.b":
		"a liberação de locks é empurrada (plugin notification), não consultada em loop.",
	"bench.b3.t": "protegido contra drift",
	"bench.b3.b":
		"um SDK de tipos gerado, orçamentos de tokens e uma rede e2e estrita sobre o protocolo real.",
	"bench.live.title": "Custo de orientação · medido ao vivo",
	"bench.live.note":
		"Tokens do texto que um agente vê (≈4 bytes/token), medidos ao vivo no protocolo com proposals+memory. A linha de base é uma estimativa ilustrativa de orientar-se à mão — não a medição de uma ferramenta de terceiros.",
	"bench.baseline": "sem mcp-vertex (à mão · estimativa)",
	"plugins.title": "Plugins",
	"plugins.lead":
		"Os pacotes publicados. Carregue só o que precisa; o núcleo continua mínimo.",
	"cfg.title": "Configurações",
	"cfg.theme": "Tema",
	"cfg.language": "Idioma",
	"cfg.motion": "Movimento",
	"cfg.motionLabel": "Animar as marquees",
	"footer.built": "Gerado a partir do registro vivo de ferramentas.",
	"pluginpage.back": "Voltar",
	"pluginpage.tools": "Ferramentas",
	"pluginpage.install": "Instalação",
	"plugin.proposals":
		"Coordenação multi-agente: locks, fila de tarefas, slices, round-context, reparo de estado.",
	"plugin.git": "Inspeção de repositório somente leitura: status, arquivos alterados, diff, log.",
	"plugin.memory":
		"Notas duráveis entre sessões com recall BM25, cotas, TTL e ocultação de segredos.",
	"plugin.search": "Busca de baixo custo no workspace: substring ou regex, globs incluir/excluir.",
	"plugin.rules":
		"Detecção de framework + orientação de lint/convenções; a config do projeto manda.",
	"plugin.quality":
		"Executa gates de qualidade (lint/test/build) com política allow/deny; cancelável.",
	"plugin.docs":
		"Cataloga e lê a documentação markdown do projeto, navegação curada de baixo custo.",
	"plugin.deps": "Inventário de dependências offline + saúde (lockfile, ranges frouxos, duplicados).",
	"plugin.notification": "Empurra eventos de liberação de lock para os agentes pararem de fazer polling.",
	"plugin.core": "O núcleo agnóstico: overview, scaffold, métricas, doctor e o carregador de plugins.",
};

export default dict;
export { dict };