import z from 'zod';

/**
 * The messages the knowledge, settings and toolbar webviews post. A webview
 * is a page that renders outside data, so what it sends is checked here as
 * for the dashboard and the agent catalog, not duck-typed at each handler.
 */
export const KNOWLEDGE_MESSAGE_SCHEMA = z.looseObject({
	command: z.literal('openEntry'),
	id: z.string().min(1),
});

export const SETTINGS_MESSAGE_SCHEMA = z.looseObject({
	requestId: z.string().min(1),
	command: z.string().min(1),
	settings: z.unknown().optional(),
});

export const TOOLBAR_MESSAGE_SCHEMA = z.discriminatedUnion('command', [
	z.looseObject({
		command: z.literal('delendaiAction'),
		action: z.string().min(1).optional(),
		commandId: z.string().min(1).optional(),
	}),
	z.looseObject({
		command: z.enum(['setLanguage', 'persistLanguage']),
		lang: z.string().min(1),
	}),
]);
