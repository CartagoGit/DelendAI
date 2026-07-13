import { z } from 'zod';

const PathSegmentSchema = z.union([
	z.string().min(1).max(200),
	z.number().int().nonnegative(),
]);
const EditSchema = z.discriminatedUnion('action', [
	z
		.object({
			action: z.literal('set'),
			path: z.array(PathSegmentSchema).min(1).max(20),
			value: z.unknown(),
		})
		.strict(),
	z
		.object({
			action: z.literal('delete'),
			path: z.array(PathSegmentSchema).min(1).max(20),
		})
		.strict(),
]);

export const CONFIGURATION_CENTER_MESSAGE_SCHEMA = z.discriminatedUnion(
	'command',
	[
		z
			.object({
				command: z.literal('saveConfiguration'),
				expectedDigest: z.string().regex(/^[a-f0-9]{64}$/u),
				edits: z.array(EditSchema).max(500),
			})
			.strict(),
		z.object({ command: z.literal('discardConfiguration') }).strict(),
	],
);
