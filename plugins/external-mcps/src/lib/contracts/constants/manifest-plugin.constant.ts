/**
 * The file that makes an MCP server a delendai plugin: a JSON manifest,
 * valid against `packages/core/schema/delendai.plugin-manifest.schema.json`,
 * in the directory of the server's command or script.
 */
export const MANIFEST_PLUGIN_FILE = 'delendai.plugin.json';

/** Permissions that let a manifest plugin receive host environment variables. */
export const ENV_PERMISSIONS = ['env-read', 'secrets'] as const;
