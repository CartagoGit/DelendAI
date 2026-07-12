/**
 * first-party-scope.constant.ts — f00107 S1.
 *
 * The maintainer's npm scope. A plugin whose resolved module specifier is
 * under this scope is first-party (bundled with the library) — the same
 * convention `resolvePluginSpecifier` applies when it expands a bare name
 * to `@mcp-vertex/<name>` first. Lives in contracts/constants so the origin
 * classifier and any future consumer share one definition.
 */
export const FIRST_PARTY_SCOPE = '@mcp-vertex/';
