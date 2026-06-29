import {
	DEFAULT_EXTENSION_SETTINGS,
	type IExtensionSettings,
} from '@mcp-vertex/client';
import { z } from 'zod';

/**
 * The wire-format shape of the extension-settings payload posted by the
 * `renderSettings` webview. Closes the H13 half of f00062: the webview
 * used to stringify booleans as `'true' / 'false'` and the host re-coerced
 * them with `value === 'true'`. The schema is now the single source of
 * truth — the renderer emits the declared types (booleans stay booleans)
 * and the host `safeParse`s the payload at the boundary. Malformed input
 * is rejected before it touches the `ISettingsStore`.
 *
 * The schema enforces SHAPE only (types, enum membership, non-empty URL).
 * The semantic check (the docs URL must point at the docs host) stays in
 * `SettingsService.validateExtensionSettings` because the URL check is
 * contextual on `allowLocalhost` / `allowPrivateIps`.
 */
export const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);
export const ThemeSchema = z.enum(['system', 'light', 'dark']);

export const ExtensionSettingsSchema = z.object({
	docsUrl: z.string().min(1).url(),
	allowLocalhost: z.boolean(),
	allowPrivateIps: z.boolean(),
	logLevel: LogLevelSchema,
	theme: ThemeSchema,
});

export type ExtensionSettings = z.infer<typeof ExtensionSettingsSchema>;

// Re-export the canonical type + defaults so the host command only needs
// to import from one place.
export { DEFAULT_EXTENSION_SETTINGS };
export type { IExtensionSettings };
