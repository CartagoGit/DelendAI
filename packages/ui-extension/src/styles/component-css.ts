export interface IComponentCssTokens {
	readonly '--mv-bg-primary': string;
	readonly '--mv-fg-primary': string;
}

export const HOST_TOKEN_MIGRATION_MAP = Object.freeze({
	'--vscode-editor-background': '--mv-bg-primary',
	'--vscode-editor-foreground': '--mv-fg-primary',
} satisfies Record<string, keyof IComponentCssTokens>);

export const DEFAULT_TOKENS: IComponentCssTokens = Object.freeze({
	'--mv-bg-primary': '#0d1117',
	'--mv-fg-primary': '#c9d1d9',
});

export const renderComponentCssTokenRootCss = (
	tokens: IComponentCssTokens = DEFAULT_TOKENS,
): string => `:root {
	${Object.entries(tokens)
		.map(([name, value]) => `${name}: ${value};`)
		.join('\n\t')}
}`;