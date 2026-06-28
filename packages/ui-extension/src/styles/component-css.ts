// f00060 S1 — `IComponentCssTokens` interface + frozen `DEFAULT_TOKENS` for the
// ui-extension component-CSS refactor. Imported by S2 (webview migration) and S3 (snapshot test).

export interface IComponentCssTokens {
	readonly 'bg-primary': string;
	readonly 'bg-secondary': string;
	readonly 'fg-primary': string;
	readonly 'fg-secondary': string;
	readonly 'border-primary': string;
	readonly accent: string;
}

export const DEFAULT_TOKENS: IComponentCssTokens = Object.freeze({
	'bg-primary': '#1e1e1e',
	'bg-secondary': '#252526',
	'fg-primary': '#d4d4d4',
	'fg-secondary': '#858585',
	'border-primary': '#3c3c3c',
	accent: '#007acc',
});
