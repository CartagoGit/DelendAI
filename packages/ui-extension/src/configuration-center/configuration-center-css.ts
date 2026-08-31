import { renderComponentCssTokenRootCss } from '../styles/component-css';

export const configurationCenterCss = (): string => `
${renderComponentCssTokenRootCss()}
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
body {
	margin: 0;
	font: 13px/1.45 var(--vscode-font-family, Inter, ui-sans-serif, system-ui, sans-serif);
	color: var(--mcpv-fg-primary);
	background: var(--mcpv-bg-primary);
}
button, input, select, textarea { font: inherit; }
button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
	outline: 2px solid var(--vscode-focusBorder, #4daafc);
	outline-offset: 2px;
}
.mcpv-config { height: 100vh; min-height: 0; overflow: hidden; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; }
.mcpv-config__header {
	position: sticky; top: 0; z-index: 5;
	display: flex; align-items: center; justify-content: space-between; gap: 20px;
	padding: 20px 24px;
	background: color-mix(in srgb, var(--mcpv-bg-primary) 92%, transparent);
	border-bottom: 1px solid var(--vscode-panel-border, #30363d);
	backdrop-filter: blur(12px);
}
.mcpv-config__heading h1 { margin: 0; font-size: 20px; letter-spacing: -.02em; }
.mcpv-config__heading p { margin: 3px 0 0; color: var(--vscode-descriptionForeground, #8b949e); }
.mcpv-config__search {
	width: min(360px, 38vw); padding: 8px 11px;
	color: var(--vscode-input-foreground, #c9d1d9);
	background: var(--vscode-input-background, #0d1117);
	border: 1px solid var(--vscode-input-border, #30363d); border-radius: 7px;
}
.mcpv-config__body { display: grid; grid-template-columns: 220px minmax(0, 1fr); min-height: 0; overflow: hidden; }
.mcpv-config__nav {
	padding: 18px 12px;
	border-right: 1px solid var(--vscode-panel-border, #30363d);
	background: var(--vscode-sideBar-background, color-mix(in srgb, var(--mcpv-bg-primary) 96%, white));
}
.mcpv-config__tab {
	width: 100%; display: flex; align-items: center; gap: 8px;
	margin: 2px 0; padding: 8px 10px;
	color: var(--vscode-sideBar-foreground, inherit); background: transparent;
	border: 0; border-radius: 6px; cursor: pointer; text-align: left;
}
.mcpv-config__tab:hover { background: var(--vscode-list-hoverBackground, #ffffff0d); }
.mcpv-config__tab[aria-selected="true"] {
	color: var(--vscode-list-activeSelectionForeground, #fff);
	background: var(--vscode-list-activeSelectionBackground, #094771);
}
.mcpv-config__tab-count {
	margin-left: auto; min-width: 22px; padding: 1px 6px; border-radius: 999px;
	font-size: 11px; text-align: center;
	background: color-mix(in srgb, currentColor 14%, transparent);
}
.mcpv-config__tab-warning { color: var(--vscode-editorWarning-foreground, #cca700); }
.mcpv-config__content { min-width: 0; padding: 24px; overflow: auto; }
.mcpv-config__panel[hidden] { display: none; }
.mcpv-config__panel { max-width: 1040px; margin: 0 auto; }
.mcpv-config__panel-title { margin: 0 0 16px; font-size: 17px; }
.mcpv-config__grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
.mcpv-config__card {
	min-width: 0; padding: 16px;
	background: var(--vscode-editorWidget-background, #161b22);
	border: 1px solid var(--vscode-widget-border, #30363d); border-radius: 9px;
}
.mcpv-config__card--highlight {
	border-color: var(--vscode-focusBorder, #007fd4);
	box-shadow: 0 0 0 1px var(--vscode-focusBorder, #007fd4);
}
.mcpv-config__card-head { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 13px; }
.mcpv-config__card-title { min-width: 0; margin: 0; font-size: 14px; overflow-wrap: anywhere; }
.mcpv-config__card-meta { margin: 2px 0 0; color: var(--vscode-descriptionForeground, #8b949e); font-size: 11px; }
.mcpv-config__badges { display: flex; flex-wrap: wrap; gap: 5px; margin-left: auto; }
.mcpv-config__badge {
	display: inline-flex; align-items: center; padding: 2px 7px;
	border: 1px solid color-mix(in srgb, currentColor 24%, transparent);
	border-radius: 999px; font-size: 10px; white-space: nowrap;
}
.mcpv-config__badge--active { color: var(--vscode-testing-iconPassed, #3fb950); }
.mcpv-config__badge--inactive { color: var(--vscode-disabledForeground, #7d8590); }
.mcpv-config__field { display: block; margin: 0 0 12px; }
.mcpv-config__field:last-child { margin-bottom: 0; }
.mcpv-config__field-label { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; font-weight: 600; }
.mcpv-config__required { color: var(--vscode-errorForeground, #f85149); }
.mcpv-config__description { margin: 0 0 5px; color: var(--vscode-descriptionForeground, #8b949e); font-size: 11px; }
.mcpv-config__control {
	display: block; width: 100%; padding: 7px 9px;
	color: var(--vscode-input-foreground, #c9d1d9);
	background: var(--vscode-input-background, #0d1117);
	border: 1px solid var(--vscode-input-border, #30363d); border-radius: 5px;
}
textarea.mcpv-config__control { min-height: 112px; resize: vertical; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
.mcpv-config__checkbox { display: inline-flex; align-items: center; gap: 8px; }
.mcpv-config__checkbox input { accent-color: var(--vscode-focusBorder, #4daafc); }
.mcpv-config__control[readonly], .mcpv-config__control:disabled { opacity: .72; cursor: not-allowed; }
.mcpv-config__field-error { display: none; margin: 4px 0 0; color: var(--vscode-errorForeground, #f85149); font-size: 11px; }
.mcpv-config__field[data-invalid="true"] .mcpv-config__field-error { display: block; }
.mcpv-config__field[data-invalid="true"] .mcpv-config__control { border-color: var(--vscode-inputValidation-errorBorder, #be1100); }
.mcpv-config__notice, .mcpv-config__banner {
	margin: 0 0 16px; padding: 10px 12px; border-radius: 6px;
	background: var(--vscode-textBlockQuote-background, #ffffff0a);
	border-left: 3px solid var(--vscode-textBlockQuote-border, #007acc);
}
.mcpv-config__banner--conflict { border-color: var(--vscode-editorWarning-foreground, #cca700); }
.mcpv-config__banner--invalid { border-color: var(--vscode-errorForeground, #f85149); }
.mcpv-config__artifact { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: center; }
.mcpv-config__artifact + .mcpv-config__artifact { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--vscode-widget-border, #30363d); }
.mcpv-config__artifact-id { overflow-wrap: anywhere; }
.mcpv-config__empty { padding: 28px; text-align: center; color: var(--vscode-descriptionForeground, #8b949e); }
.mcpv-config__footer {
	position: sticky; bottom: 0; z-index: 5; display: flex; align-items: center; gap: 10px;
	padding: 12px 24px; border-top: 1px solid var(--vscode-panel-border, #30363d);
	background: color-mix(in srgb, var(--mcpv-bg-primary) 94%, transparent); backdrop-filter: blur(12px);
}
.mcpv-config__status { margin-right: auto; color: var(--vscode-descriptionForeground, #8b949e); font-size: 12px; }
.mcpv-config__button { padding: 7px 14px; border: 1px solid transparent; border-radius: 5px; cursor: pointer; }
.mcpv-config__button--primary { color: var(--vscode-button-foreground, #fff); background: var(--vscode-button-background, #0e639c); }
.mcpv-config__button--secondary { color: var(--vscode-button-secondaryForeground, #fff); background: var(--vscode-button-secondaryBackground, #3a3d41); }
.mcpv-config__button:disabled { opacity: .55; cursor: not-allowed; }
[data-search-hidden="true"] { display: none !important; }
@media (max-width: 700px) {
	.mcpv-config__header { align-items: stretch; flex-direction: column; padding: 14px; }
	.mcpv-config__search { width: 100%; }
	.mcpv-config__body { grid-template-columns: 1fr; }
	.mcpv-config__nav { display: flex; gap: 4px; overflow-x: auto; padding: 8px; border-right: 0; border-bottom: 1px solid var(--vscode-panel-border, #30363d); }
	.mcpv-config__tab { width: auto; flex: 0 0 auto; }
	.mcpv-config__content { padding: 14px; }
	.mcpv-config__footer { padding: 10px 14px; }
}
@media (prefers-reduced-motion: reduce) {
	*, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
`;
