/**
 * shared-ui-strings.ts — the single, host-agnostic home for the brand /
 * UI copy that BOTH surfaces use: the docs site (`apps/web`, which imports
 * `@mcp-vertex/ui-extension/public`) and every extension shell built on
 * this package (`extensions/vscode` today). (f00053 S7.)
 *
 * Before this module the product name, tagline, repo URL and brand token
 * names were re-typed in `apps/web/src/i18n/*`, in the VS Code extension,
 * and inline in this package's components. This module is the one place
 * they live.
 *
 * PURITY CONTRACT: this file imports NOTHING host-specific — no `vscode`,
 * no `astro`, no web `#ALIAS`, no DOM. It is plain data so either surface
 * can consume it at build time or runtime. The spec enforces this.
 */

/** Brand + product copy shared across every mcp-vertex UI surface. */
export const SHARED_UI_STRINGS = {
	/** The published package / canonical product name. */
	productName: '@mcp-vertex/core',
	/** The brand display name (used in headers, titles). */
	brandName: 'MCP Vertex',
	/** The stdio MCP server name (and default tool namespace). */
	serverName: 'mcp-vertex',
	/** One-line product description. */
	shortTagline: 'An MCP server core + plugin loader for any project.',
	/** Full tagline. */
	tagline:
		'A project-agnostic Model Context Protocol server core. The core knows nothing about your domain — capabilities ship as plugins you load on demand, all measured for low token cost.',
	/** Canonical source repository. */
	repoUrl: 'https://github.com/CartagoGit/mcp-vertex',
	/** Canonical docs site. */
	docsUrl: 'https://mcp-vertex.dev',
} as const;

export type SharedUiStringKey = keyof typeof SHARED_UI_STRINGS;

/**
 * The CSS custom-property names of the brand gradient. Both the web and
 * the extension header render the same gradient from these tokens.
 */
export const BRAND_TOKENS = {
	blue: '--mv-brand-blue',
	purple: '--mv-brand-purple',
} as const;
