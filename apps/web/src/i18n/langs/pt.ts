import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'Conceito',
		install: 'Instalar',
		tools: 'Ferramentas',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		presets: 'Presets',
		github: 'GitHub',
		menu: 'Menu',
		knowledge: 'Conhecimento',
		prompts: 'Prompts',
		resources: 'Recursos',
		skills: 'Habilidades',
		guide: 'Guia',
		more: 'Mais',
		firstFiveMinutes: 'Primeiros 5 minutos',
		troubleshooting: 'Resolução de problemas',
	},
	hero: {
		title: { a: 'O ', b: 'MCP Vertex', c: ' agnóstico' },
		subheader:
			'Um núcleo de servidor MCP + carregador de plugins para qualquer projeto.',
		tagline:
			'Um núcleo de servidor Model Context Protocol agnóstico ao projeto. O núcleo não sabe nada do seu domínio — as capacidades chegam como plugins que você carrega sob demanda, todas medidas para baixo custo de tokens.',
		ctaInstall: 'Começar',
		ctaTools: 'Ver as ferramentas',
		runsOn: 'Roda em Node, Deno e bun · qualquer gerenciador de pacotes',
	},
	marquee: {
		runtimes: 'Construído com · roda em',
		clients: 'Clientes MCP e modelos',
	},
	concept: {
		title: 'Um núcleo pequeno, muitos plugins',
		body: 'mcp-vertex é o núcleo hermético: registro determinístico de ferramentas, caminhos de workspace injetados, um carregador de plugins por CLI e uma superfície de ferramentas medida em tokens. Tudo específico do domínio é um plugin — carregue só o que precisa, sob qualquer host ou modelo.',
		f1: {
			t: 'Agnóstico ao projeto',
			b: 'Sem código de domínio no núcleo. O mesmo plugin se comporta igual sob qualquer host ou modelo.',
		},
		f2: {
			t: 'Poucos tokens por design',
			b: 'Um único overview, conhecimento preguiçoso e JSON compacto. Um orçamento medido protege de regressões na CI.',
		},
		f3: {
			t: 'Concorrência segura',
			b: 'Escritas atômicas, um mutex entre processos com tokens de propriedade e quarentena de corrupção.',
		},
		f4: {
			t: 'Pronto para multi-agente',
			b: 'O plugin proposals coordena um swarm: locks, fila de tarefas, disjunção de slices e notificações push.',
		},
	},
	install: {
		title: 'Instalar e executar',
		lead: 'Adicione e aponte seu cliente MCP para o binário mcp-vertex:',
		verify: 'Verifique que arranca',
		addto: 'Adicione ao seu IDE / agente',
		presets: 'Presets:',
		oneCmd: 'Um comando · qualquer IDE',
		oneCmdNote:
			'Deteta o teu IDE e adiciona o mcp-vertex — sem tocar nos teus outros servidores MCP.',
		config: 'Escolha um preset (minimal · standard · swarm) ou liste plugins. Rode com --check para autodiagnóstico.',
		excludeHelp:
			'Subtraia plugins do conjunto resolvido com --exclude-plugins= (alias: --excludePlugins=). Útil para descartar um plugin de um preset sem fazer fork — p. ex. --preset=swarm --exclude-plugins=notification para uma sessão de agente único.',
	},
	tools: {
		title: 'Ferramentas',
		lead: 'Todas as ferramentas do conjunto completo de plugins, agrupadas por namespace — extraídas do registro vivo, então esta página nunca diverge do código.',
		count: 'ferramentas',
		packages: 'pacotes',
	},
	bench: {
		title: 'Medido, não prometido',
		lead: 'A eficiência de tokens é um invariante protegido — um teste de CI falha se estes tetos regredirem.',
		b1: {
			t: 'partida a frio',
			b: 'overview (compacto) + auto_work — orientação completa em menos de 300 tokens.',
		},
		b2: {
			t: 'sem polling',
			b: 'a liberação de locks é empurrada (plugin notification), não consultada em loop.',
		},
		b3: {
			t: 'protegido contra drift',
			b: 'um SDK de tipos gerado, orçamentos de tokens e uma rede e2e estrita sobre o protocolo real.',
		},
		live: {
			title: 'Custo de orientação · medido ao vivo',
			note: 'Tokens do texto que um agente vê (≈4 bytes/token), medidos ao vivo no protocolo com proposals+memory. A linha de base é uma estimativa ilustrativa de orientar-se à mão — não a medição de uma ferramenta de terceiros.',
		},
		baseline: 'sem mcp-vertex (à mão · estimativa)',
	},
	plugins: {
		title: 'Plugins',
		lead: 'Os pacotes publicados. Carregue só o que precisa; o núcleo continua mínimo.',
	},
	cfg: {
		title: 'Configurações',
		theme: 'Tema',
		language: 'Idioma',
		motion: 'Movimento',
		motionLabel: 'Animar as marquees',
	},
	search: {
		title: 'Pesquisar',
		placeholder: 'Pesquisar no site...',
	},
	footer: {
		built: 'Gerado a partir do registro vivo de ferramentas.',
		tagline:
			'Um núcleo de servidor MCP agnóstico ao projeto + carregador de plugins.',
		sections: 'Secções',
		resources: 'Recursos',
		madeBy: 'Feito por Cartago · @CartagoGit no GitHub',
		creatorsRepo: 'Autor no GitHub',
		creatorsNpm: 'Autor no npm',
	},
	pluginpage: {
		back: 'Voltar',
		tools: 'Ferramentas',
		install: 'Instalação',
		tabInstall: 'Instalação',
		tabTools: 'Ferramentas',
		tabConfiguration: 'Configuração',
		tabTutorial: 'Tutorial',
	},
	plugin: {
		proposals:
			'Coordenação multi-agente: locks, fila de tarefas, slices, round-context, reparo de estado.',
		git: 'Inspeção de repositório somente leitura: status, arquivos alterados, diff, log.',
		memory: 'Notas duráveis entre sessões com recall BM25, cotas, TTL e ocultação de segredos.',
		search: 'Busca de baixo custo no workspace: substring ou regex, globs incluir/excluir.',
		rules: 'Detecção de framework + orientação de lint/convenções; a config do projeto manda.',
		quality:
			'Executa gates de qualidade (lint/test/build) com política allow/deny; cancelável.',
		docs: 'Cataloga e lê a documentação markdown do projeto, navegação curada de baixo custo.',
		deps: 'Inventário de dependências offline + saúde (lockfile, ranges frouxos, duplicados).',
		notification:
			'Empurra eventos de liberação de lock para os agentes pararem de fazer polling.',
		logs: 'Append-only redacted event log with query, tail and correlation tools.',
		'status-marker':
			'Marcador de fechamento colorido obrigatório para cada resposta do agente: 8 estados canônicos, ferramentas helper + validador.',
		core: 'O núcleo agnóstico: overview, scaffold, métricas, doctor e o carregador de plugins.',
	},
	toolpage: {
		back: 'Voltar',
		backToPlugin: 'Voltar ao plugin',
		arguments: 'Argumentos',
		argName: 'Argumento',
		argType: 'Tipo',
		argRequired: 'Obrigatório',
		argDescription: 'Descrição',
		argRequiredYes: 'sim',
		argRequiredNo: 'não',
		noArguments: 'Esta ferramenta não recebe argumentos.',
		effects: 'Efeitos',
		effectReadOnly: 'somente leitura',
		example: 'Chamada de exemplo',
		exampleNote:
			'Mostrado como um payload genérico de chamada de ferramenta MCP; o transporte exato depende do seu cliente.',
		plugin: 'Plugin',
	},
	firstFiveMinutes: {
		title: 'Primeiros 5 minutos',
		lead: 'Três guias rápidos para copiar e colar. Escolha o que corresponde a como você executa o mcp-vertex.',
		profileTabBunNode: 'Bun / Node',
		profileTabVscode: 'VS Code / Copilot',
		profileTabClaude: 'Claude Code',
		bunNode: {
			title: 'Bun / Node — execute o servidor diretamente',
			intro: 'Sem integração de editor: execute o host server num terminal e aponte qualquer cliente MCP para o seu transporte stdio.',
			steps: [
				'Instalar: `bun add @mcp-vertex/core` (ou `npm install @mcp-vertex/core`).',
				'Executar: `bunx mcp-vertex --preset=standard` (ou `npx mcp-vertex --preset=standard`).',
				'Verificar: o processo imprime a lista de plugins carregados e espera no stdio — Ctrl+C para parar.',
				'Aponte a configuração do seu cliente MCP para o binário com `--preset=minimal|standard|swarm` (ver Instalar para a lista completa de flags).',
				'Chame `mcp-vertex_overview { compact: true }` primeiro — ele diz o que fazer a seguir.',
			],
		},
		vscode: {
			title: 'VS Code / GitHub Copilot',
			intro: 'O instalador de um comando deteta o VS Code e adiciona o mcp-vertex à tua lista de servidores MCP sem tocar nos existentes.',
			steps: [
				'Executa o instalador de um comando a partir da página Instalar (deteta o teu IDE automaticamente).',
				'Recarrega a janela (`Developer: Reload Window`) para o Copilot reconhecer o novo servidor.',
				'Abre o painel de chat do Copilot e seleciona o agente `mcp-vertex` no seletor de agentes.',
				'Pede-lhe para chamar `mcp-vertex_overview` — deve reportar o preset carregado e uma ação recomendada.',
				'Se o servidor não aparecer, consulta Resolução de problemas → "MCP server not detected".',
			],
		},
		claude: {
			title: 'Claude Code',
			intro: 'O Claude Code lê `.mcp.json` na raiz do workspace; o instalador escreve ou faz merge desse ficheiro por ti.',
			steps: [
				'Executa o instalador de um comando — deteta o Claude Code e escreve `.mcp.json`.',
				'Reinicia o Claude Code (ou executa `/mcp` para recarregar servidores) para reconhecer a nova entrada.',
				'Numa sessão nova, os ficheiros sempre carregados `AGENTS.md` + `CLAUDE.md` já apontam para `mcp-vertex_overview` como primeira chamada.',
				'Confirma com `mcp-vertex_overview { compact: true }` — o campo `recommendedNextAction` diz o que fazer a seguir.',
				'Para sessões multi-agente, lê o skill `proposal-swarm-runner` antes de reclamar um slice.',
			],
		},
		nextSteps: 'Para onde ir a seguir',
		nextToolsCta: 'Ver todas as ferramentas',
		nextTroubleshootingCta: 'Algo não funciona? Resolução de problemas',
	},
	troubleshooting: {
		title: 'Resolução de problemas',
		lead: 'Sintoma → causa provável → solução, para os problemas realmente reportados.',
		symptom: 'Sintoma',
		cause: 'Causa provável',
		fix: 'Solução',
		tags: 'Etiquetas',
		backToIndex: 'Voltar à resolução de problemas',
		closedBy: 'Fechado por',
		empty: 'Nenhum caso de resolução de problemas corresponde a este filtro ainda.',
	},
	knowledge: {
		title: 'Conhecimento',
		lead: 'Documentos catalogados sobre os quais o núcleo pode responder perguntas.',
		count: 'documentos',
	},
	prompts: {
		title: 'Prompts',
		lead: 'Modelos de prompts reutilizáveis expostos pelo núcleo.',
		count: 'prompts',
		arg: 'argumentos',
	},
	resources: {
		title: 'Recursos',
		lead: 'Recursos estáticos incluídos com o projeto (URI + MIME).',
		count: 'recursos',
		uri: 'URI',
		mime: 'MIME',
	},
	skills: {
		title: 'Habilidades',
		lead: 'Manuais de domínio que o agente pode carregar sob demanda.',
		count: 'habilidades',
		body: 'Corpo',
	},
	notFound: {
		code: '404',
		title: 'Página não encontrada',
		lead: 'A página que procuras não existe ou foi movida. O núcleo continua agnóstico — mesmo de URLs quebradas.',
		homeCta: 'Voltar ao início',
		toolsCta: 'Ver as ferramentas',
		homeAria: 'Ir para o início',
	},
	proposals: proposalGlossaryByLang.pt,
	recovery: recoveryByLang.pt,
	logs: logsByLang.pt,
	presets: {
		title: 'Presets',
		lead: 'Conjuntos de plugins pré-configurados para diferentes tamanhos de espaço de trabalho.',
		summary:
			'Este repositório contém {count} plugins exclusivos nos presets.',
		hostOnlyChip: 'apenas host',
		installTitle: 'Como usar',
		installLead:
			'Especifique a bandeira --preset ao iniciar o servidor MCP.',
		table: {
			preset: 'Preset',
		},
	},
};

export default dict;
