import type { LangDict } from '../shared';

const dict: LangDict = {
	nav: {
		concept: 'Conceito',
		install: 'Instalar',
		tools: 'Ferramentas',
		benchmarks: 'Benchmarks',
		plugins: 'Plugins',
		github: 'GitHub',
		resources: 'Recursos',
		skills: 'Habilidades',
		guide: 'Guia',
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
	pluginpage: { back: 'Voltar', tools: 'Ferramentas', install: 'Instalação' },
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
		'status-marker':
			'Marcador de fechamento colorido obrigatório para cada resposta do agente: 8 estados canônicos, ferramentas helper + validador.',
		core: 'O núcleo agnóstico: overview, scaffold, métricas, doctor e o carregador de plugins.',
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
		title: 'Página não encontrada',
		lead: 'A página que procuras não existe ou foi movida. O núcleo continua agnóstico — mesmo de URLs quebradas.',
		homeCta: 'Voltar ao início',
		toolsCta: 'Ver as ferramentas',
		homeAria: 'Ir para o início',
	},
};

export default dict;
