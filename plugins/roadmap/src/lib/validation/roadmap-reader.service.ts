import { ROADMAP_SCHEMA_VERSION } from '../contracts/constants/roadmap.constant';
import type {
	IRoadmap,
	IRoadmapResult,
} from '../contracts/interfaces/roadmap.interface';
import { roadmapSchema } from '../contracts/schemas/roadmap.schema';

const readSchemaVersion = (raw: unknown): number | undefined => {
	if (typeof raw !== 'object' || raw === null) return undefined;
	const version = (raw as { readonly schemaVersion?: unknown }).schemaVersion;
	return typeof version === 'number' ? version : undefined;
};

/**
 * Turns parsed file contents into a roadmap, or says why it cannot. A
 * version newer than this package understands is refused with the way
 * out, because guessing at fields it does not know would silently drop
 * them on the next write.
 */
export const readRoadmap = (raw: unknown): IRoadmapResult<IRoadmap> => {
	const version = readSchemaVersion(raw);
	if (version === undefined) {
		return {
			ok: false,
			reason: 'roadmap has no numeric schemaVersion; add schemaVersion: 1 at the top level',
		};
	}
	if (version > ROADMAP_SCHEMA_VERSION) {
		return {
			ok: false,
			reason: `roadmap schemaVersion ${version} is newer than the ${ROADMAP_SCHEMA_VERSION} this delendai understands; upgrade delendai instead of editing the file`,
		};
	}
	const parsed = roadmapSchema.safeParse(raw);
	if (parsed.success) return { ok: true, value: parsed.data };
	const issue = parsed.error.issues[0];
	const where = issue?.path.join('.') ?? '';
	return {
		ok: false,
		reason: `roadmap is not valid${where === '' ? '' : ` at ${where}`}: ${issue?.message ?? 'unknown error'}`,
	};
};
