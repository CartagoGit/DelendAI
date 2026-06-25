import type { LangDict } from '#I18N/shared';
import { logsByLang } from '#I18N/logs';
import { proposalGlossaryByLang, recoveryByLang } from '#I18N/proposals';

const dict: LangDict = {
	nav: {
		concept: 'Conceito',
		install: 'Instalar',
		setup: 'Configuração',
		capabilities: 'Capacidades',
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
		config: 'Escolha um preset (minimal · standard · swarm · full) ou liste plugins. Rode com --check para autodiagnóstico.',
		excludeHelp:
			'Subtraia plugins do conjunto resolvido com --exclude-plugins= (alias: --excludePlugins=). Útil para descartar um plugin de um preset sem fazer fork — p. ex. --preset=swarm --exclude-plugins=notification para uma sessão de agente único.',
		tabsPackageManager: 'Gestor de pacotes',
		tabsIde: 'IDE / agente',
		tabsPreset: 'Preset',
		pmStep1Title: '1. Inicializar',
		pmStep1Body:
			'Execute o instalador de um comando. Deteta o editor, funde a configuração e mostra o que fez.',
		pmStep2Title: '2. Verificar',
		pmStep2Body:
			'Execute o mesmo gestor com `--check` para autodiagnóstico.',
		pmRecommend: 'Recomendado',
		ideFileLabel: 'Arquivo de config',
		ideScopeLabel: 'Âmbito',
		ideScopeProject: 'projeto',
		ideScopeGlobal: 'global',
		ideScopeBoth: 'projeto / global',
		ideWhyLabel: 'Por que este formato?',
		ideWhyBody:
			'Cada IDE usa uma chave JSON ligeiramente diferente (`mcpServers`, `servers`, `context_servers`) e um caminho distinto. O renderizador adapta-se sozinho — cole como está.',
		presetSizeLabel: 'plugins',
		presetUseLabel: 'Use para',
		presetPluginsLabel: 'Plugins incluídos',
		presetFoot:
			'Passe qualquer preset ao servidor com `--preset=<nome>`. Os presets são aditivos — combine `--include-plugins=` e `--exclude-plugins=` para afinar sem fork.',
		copy: 'Copiar',
		copied: 'Copiado!',
		faqTitle: 'Perguntas frequentes',
		faqQ1: 'Por que `deno run -A npm:@mcp-vertex/core` demora a iniciar?',
		faqA1: 'O Deno resolve e verifica o pacote npm no primeiro uso. As execuções seguintes reutilizam a cache em `~/.cache/deno`. Para arranques repetidos, prefira bun ou npx.',
		faqQ2: 'Meu IDE não está na lista — e agora?',
		faqA2: 'Qualquer IDE que aceite um servidor MCP stdio funciona. Pegue o JSON do VS Code, mude o caminho para o que o seu IDE espera e registe o mesmo comando + argumentos.',
		faqQ3: 'Posso executar vários presets ao mesmo tempo?',
		faqA3: 'Não — um servidor, um preset. Se precisar de conjuntos diferentes de plugins por projeto, coloque um `mcp-vertex.config.json` nesse projeto e o loader lê-o primeiro.',
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
		issues: {
			description:
				'GitHub issues plugin — ingest, analyse and (optionally) promote to a proposal.',
			requires: 'requires',
			installSnippet: 'mcp-vertex --plugins=proposals,issues',
		},
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
				'Aponte a configuração do seu cliente MCP para o binário com `--preset=minimal|standard|swarm|full` (ver Instalar para a lista completa de flags).',
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
				'Para sessões multi-agente, lê o skill `mcp-vertex-proposal-swarm-runner` antes de reclamar um slice.',
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
	setup: {
		title: 'Configuração entre projetos',
		lead: 'Integre o mcp-vertex em qualquer repositório e deixe o plugin de issues do GitHub pronto para esse repo — os mesmos 7 passos que o comando setup-github executa.',
		stepsTitle: 'Os 7 passos',
		docsLinkLabel: 'Leia o guia canônico de configuração entre projetos',
		detectRepoTitle: 'Detectar o repo',
		detectRepoBody:
			'Lê o remoto do GitHub e normaliza para owner/name. O slug detectado deve apontar para o repo esperado.',
		confirmRepoTitle: 'Confirmar owner/name',
		confirmRepoBody:
			'Execute o comando de configuração e confirme (ou substitua) o slug detectado antes de gravar qualquer coisa.',
		pickAuthTierTitle: 'Escolher o nível de autenticação',
		pickAuthTierBody:
			'Use gh quando gh auth status funcionar, rest-authed quando GITHUB_TOKEN estiver definido, ou rest-anon caso contrário (limitado a 60 requisições/hora).',
		writeConfigTitle: 'Gravar a configuração',
		writeConfigBody:
			'Grava plugins.issues.options.repo em mcp-vertex.config.json sem tocar em outras configurações de plugins.',
		verifyTierTitle: 'Verificar o nível',
		verifyTierBody:
			'Inicie o host com o plugin de issues carregado para exercitar de ponta a ponta o nível de autenticação escolhido.',
		printInvocationTitle: 'Imprimir a invocação',
		printInvocationBody:
			'Adicione este bloco de servidor ao seu mcp.json. O formato é o mesmo no VS Code, Cursor e Claude Code.',
		markConfiguredTitle: 'Marcar como configurado',
		markConfiguredBody:
			'Opcionalmente registre que este repo já foi configurado uma vez, para que execuções futuras pulem as perguntas.',
		optionalLabel: 'opcional',
	},
	ui: {
		codeCopy: 'Copiar',
		codeCopied: 'Copiado!',
		codeCollapse: 'Recolher',
		codeExpand: 'Expandir',
		calloutNote: 'Nota',
		calloutTip: 'Dica',
		calloutWarn: 'Aviso',
		calloutDanger: 'Perigo',
		tabsNext: 'Próximo',
		tabsPrev: 'Anterior',
		stepsOf: 'de',
	},

	homeQuickInstall: {
		title: 'Instalação rápida',
		lead: 'Escolha o seu gestor de pacotes. O mesmo comando funciona com Node, Deno e Bun — o resto está na página de instalação.',
		tabsLabel: 'Gestor de pacotes',
		pms: [
			{
				id: 'npm',
				note: 'Node Package Manager — incluído com o Node.js.',
			},
			{
				id: 'pnpm',
				note: 'Rápido, eficiente em disco, resolução estrita de dependências.',
			},
			{ id: 'yarn', note: 'Alternativa clássica ao npm.' },
			{
				id: 'bun',
				note: 'Runtime + gestor de pacotes tudo-em-um — o mcp-vertex é construído com bun.',
			},
			{
				id: 'deno',
				note: 'Runtime seguro por padrão com TypeScript de primeira classe.',
			},
		],
		recommended: 'Recomendado',
		fullCta: 'Matriz de instalação completa',
	},
	homeAtAGlance: {
		title: 'O que pode fazer?',
		lead: 'Escolha uma secção. A página inicial só orienta — cada ponto de entrada tem uma página dedicada com o detalhe completo.',
		tabsLabel: 'Secções',
		openSection: 'Abrir',
		panels: [
			{
				id: 'plugins',
				label: 'Plugins',
				summary:
					'Pacotes publicados. Carregue só o que precisa; o núcleo mantém-se mínimo.',
				href: 'plugins',
			},
			{
				id: 'tools',
				label: 'Ferramentas',
				summary:
					'Todas as ferramentas do conjunto completo de plugins, agrupadas por namespace — do registo vivo.',
				href: 'tools',
			},
			{
				id: 'bench',
				label: 'Benchmarks',
				summary:
					'A eficiência de tokens é um invariante protegido — medida, não prometida.',
				href: 'benchmarks',
			},
			{
				id: 'skills',
				label: 'Skills',
				summary:
					'Manuais de domínio que o agente pode carregar a pedido.',
				href: 'skills',
			},
			{
				id: 'knowledge',
				label: 'Conhecimento',
				summary:
					'Documentos catalogados sobre os quais o núcleo pode responder.',
				href: 'knowledge',
			},
			{
				id: 'presets',
				label: 'Presets',
				summary:
					'Conjuntos de plugins pré-configurados para qualquer tamanho de workspace.',
				href: 'presets',
			},
			{
				id: 'setup',
				label: 'Configuração entre projetos',
				summary:
					'Integre o mcp-vertex em qualquer repositório e prepare o plugin de issues.',
				href: 'setup',
			},
		],
	},
};

export default dict;
