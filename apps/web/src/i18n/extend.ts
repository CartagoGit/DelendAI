import type { Lang } from '#I18N/shared';

interface IExtendTranslations {
	readonly title: string;
	readonly lead: string;
	readonly intro: {
		readonly title: string;
		readonly body: string;
	};
	readonly tiers: {
		readonly title: string;
		readonly items: readonly {
			readonly title: string;
			readonly body: string;
			readonly bullets: readonly string[];
		}[];
	};
	readonly scaffold: {
		readonly title: string;
		readonly body: string;
		readonly command: string;
	};
	readonly contract: {
		readonly title: string;
		readonly body: string;
		readonly items: readonly string[];
	};
	readonly links: {
		readonly title: string;
		readonly guide: string;
		readonly guideHref: string;
	};
}

const en: IExtendTranslations = {
	title: 'Build an IDE host',
	lead: 'The extension surface is designed for VS Code today and other IDEs tomorrow. Use the TypeScript scaffold when you want the shared UI packages, or implement the MCP wire contract directly in another language.',
	intro: {
		title: 'One contract, many hosts',
		body: 'mcp-vertex keeps host-specific APIs behind a small adapter. The server returns tool payloads as JSON, and each IDE decides how to render commands, panels, trees, and onboarding in its own native shell.',
	},
	tiers: {
		title: 'Authoring tiers',
		items: [
			{
				title: 'TypeScript host',
				body: 'Implement IHostAdapter, use @mcp-vertex/client for stdio calls, and render shared UI builders from @mcp-vertex/ui-extension.',
				bullets: [
					'Fastest path for VS Code-like extension runtimes.',
					'Typed tool outputs through generated tool-output maps.',
					'Shared renderers for dashboard, settings, toolbar, and knowledge surfaces.',
				],
			},
			{
				title: 'Any-language host',
				body: 'Launch the server over MCP stdio, discover tools, validate outputSchema payloads, and render equivalent native UI.',
				bullets: [
					'Use this path for JetBrains, Neovim, Zed, or custom shells.',
					'No TypeScript package dependency required.',
					'Keep proposal locks and write flows intact for workspace edits.',
				],
			},
		],
	},
	scaffold: {
		title: 'Scaffold quickstart',
		body: 'Generate a compiling TypeScript reference host with an inert adapter, one overview command, a webview renderer, and a passing Vitest example.',
		command:
			'mcp-vertex_create_project {"kind":"extension-host","extensionHostName":"jetbrains","description":"JetBrains host adapter."}',
	},
	contract: {
		title: 'Compatibility surface',
		body: 'Extension hosts should depend only on the supported public contract.',
		items: [
			'IHostAdapter from @mcp-vertex/ui-extension/public.',
			'Public renderers and helpers from @mcp-vertex/ui-extension/public.',
			'McpStdioClient and services from @mcp-vertex/client.',
			'Tool outputSchema declarations and generated tool-outputs maps.',
		],
	},
	links: {
		title: 'Reference guide',
		guide: 'Read EXTENSION-AUTHORING.md',
		guideHref:
			'https://github.com/cartago-git/mcp-vertex/blob/main/docs/mcp-vertex/EXTENSION-AUTHORING.md',
	},
};

const es: IExtendTranslations = {
	title: 'Construye un host de IDE',
	lead: 'La superficie de extensión está diseñada para VS Code hoy y otros IDE mañana. Usa el scaffold TypeScript si quieres los paquetes de UI compartida, o implementa directamente el contrato MCP en otro lenguaje.',
	intro: {
		title: 'Un contrato, muchos hosts',
		body: 'mcp-vertex mantiene las APIs específicas del host detrás de un adaptador pequeño. El servidor devuelve payloads JSON, y cada IDE decide cómo renderizar comandos, paneles, árboles y onboarding en su shell nativa.',
	},
	tiers: {
		title: 'Niveles de autoría',
		items: [
			{
				title: 'Host TypeScript',
				body: 'Implementa IHostAdapter, usa @mcp-vertex/client para llamadas stdio y renderiza builders compartidos de @mcp-vertex/ui-extension.',
				bullets: [
					'Camino más rápido para runtimes de extensión parecidos a VS Code.',
					'Outputs de tools tipados mediante los mapas generados.',
					'Renderers compartidos para dashboard, settings, toolbar y knowledge.',
				],
			},
			{
				title: 'Host en cualquier lenguaje',
				body: 'Arranca el servidor por MCP stdio, descubre tools, valida payloads outputSchema y renderiza UI nativa equivalente.',
				bullets: [
					'Usa este camino para JetBrains, Neovim, Zed o shells custom.',
					'No requiere depender de paquetes TypeScript.',
					'Mantiene locks de propuestas y flujos de escritura intactos.',
				],
			},
		],
	},
	scaffold: {
		title: 'Quickstart del scaffold',
		body: 'Genera un host TypeScript de referencia que compila, con adaptador inerte, un comando overview, renderer webview y un ejemplo Vitest verde.',
		command:
			'mcp-vertex_create_project {"kind":"extension-host","extensionHostName":"jetbrains","description":"JetBrains host adapter."}',
	},
	contract: {
		title: 'Superficie compatible',
		body: 'Los hosts de extension deben depender solo del contrato publico soportado.',
		items: [
			'IHostAdapter desde @mcp-vertex/ui-extension/public.',
			'Renderers y helpers publicos desde @mcp-vertex/ui-extension/public.',
			'McpStdioClient y servicios desde @mcp-vertex/client.',
			'Declaraciones outputSchema y mapas tool-outputs generados.',
		],
	},
	links: {
		title: 'Guia de referencia',
		guide: 'Leer EXTENSION-AUTHORING.md',
		guideHref:
			'https://github.com/cartago-git/mcp-vertex/blob/main/docs/mcp-vertex/EXTENSION-AUTHORING.md',
	},
};

export const extendByLang: Readonly<Record<Lang, IExtendTranslations>> = {
	ar: en,
	de: en,
	en,
	es,
	fr: en,
	hi: en,
	it: en,
	ja: en,
	pt: en,
	th: en,
	vi: en,
	zh: en,
};
