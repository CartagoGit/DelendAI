/**
 * format-registry.constant.ts — every persisted or exchanged format
 * delendai owns, with its current version, the readers of previous
 * versions still supported and the migration from one version to the next.
 *
 * Each reader and migration points at the function that already does the
 * work; this registry adds no second mechanism. A format with no
 * previous-version reader today records its current version only and says
 * so in `note` — a migration is never invented.
 */
import z from 'zod';

import { CACHE_LAYOUT_EPOCH } from '../contracts/constants/cache-layout.constant';
import type {
	IFormatEntry,
	IFormatMigration,
} from '../contracts/interfaces/format-registry.interface';
import { createIdempotencyStore } from '../mutations/idempotency';
import { parseConfigFile } from '../plugins/load-config-file';
import { WORK_REF_SHAPE } from '../development-policy/profiles.constant';
import { SCHEMA_VERSION } from '../api/stable-manifest';
import { withOkEnvelope } from '../shared/with-ok-envelope.helper';
import { listCacheLayoutMigrations } from '../workspace-migration/cache-layout-step.service';
import { parseWorkSubject } from '../work-units/work-ref-shape.service';

const epochOf = (fixture: unknown): number | undefined => {
	const epoch = (fixture as { epoch?: unknown } | null)?.epoch;
	return typeof epoch === 'number' ? epoch : undefined;
};

/** The cache layout's `N -> N + 1` steps, taken from the shipped chain. */
const cacheLayoutMigrations = (): readonly IFormatMigration[] =>
	listCacheLayoutMigrations().map((step) => ({
		from: step.fromEpoch,
		to: step.toEpoch,
		pointer: `workspace-migration/cache-layout-step.service#listCacheLayoutMigrations:${step.id}`,
		migrate: (fixture) =>
			epochOf(fixture) === step.fromEpoch
				? { epoch: step.toEpoch }
				: fixture,
	}));

const OK_OUTPUT = withOkEnvelope(z.object({}));

export const FORMAT_REGISTRY: readonly IFormatEntry[] = [
	{
		id: 'work-ref',
		owner: ['packages/core/src/lib/work-units/work-ref-shape.service.ts'],
		introducedAt: 1,
		currentVersion: 1,
		previousReaders: [],
		currentReader: {
			version: 1,
			pointer: 'work-units/work-ref-shape.service#parseWorkSubject',
			read: (fixture) =>
				parseWorkSubject(WORK_REF_SHAPE, String(fixture)) !== undefined,
		},
		migrations: [],
		fixtures: { 1: 'implement/x00001-S1-g1/a-topic' },
		note: 'work-ref names have no previous-version reader recorded: compileWorkRefParser reads the scope spelling next to this one, but no rewrite of old refs exists',
	},
	{
		id: 'proposal-file',
		owner: ['frontmatter.helper.ts'],
		introducedAt: 1,
		currentVersion: 1,
		previousReaders: [],
		currentReader: {
			version: 1,
			pointer: 'frontmatter.helper#parseProposalFrontmatter',
		},
		migrations: [],
		fixtures: { 1: 'id: x00001\nstatus: ready\n' },
		note: 'a proposal file carries no format version yet (a later slice adds delendai-version); only the current reader is recorded',
	},
	{
		id: 'delendai-config',
		owner: [
			'delendai.config.json',
			'packages/core/schema/delendai.config.schema.json',
		],
		introducedAt: 1,
		currentVersion: 1,
		previousReaders: [],
		currentReader: {
			version: 1,
			pointer: 'plugins/load-config-file#parseConfigFile',
			read: (fixture) =>
				Object.keys(parseConfigFile(String(fixture))).length > 0,
		},
		migrations: [],
		fixtures: { 1: '{ "cacheDir": ".cache/delendai" /* comment */ }' },
		note: 'delendai.config.json carries no version; only the current reader is recorded',
	},
	{
		id: 'cache-layout',
		owner: [
			'packages/core/src/lib/contracts/constants/cache-layout.constant.ts',
			'tools/scripts/lint/cache-layout-ratchet.snapshot.json',
		],
		introducedAt: 1,
		currentVersion: CACHE_LAYOUT_EPOCH,
		previousReaders: [],
		currentReader: {
			version: CACHE_LAYOUT_EPOCH,
			pointer: 'cache/run-pending-cache-layout-migrations.service',
			read: (fixture) => epochOf(fixture) === CACHE_LAYOUT_EPOCH,
		},
		migrations: cacheLayoutMigrations(),
		fixtures: Object.fromEntries(
			Array.from({ length: CACHE_LAYOUT_EPOCH }, (_, i) => [
				i + 1,
				{ epoch: i + 1 },
			]),
		),
	},
	{
		id: 'tool-output',
		owner: ['packages/core/src/lib/shared/with-ok-envelope.helper.ts'],
		introducedAt: 1,
		currentVersion: 1,
		previousReaders: [],
		currentReader: {
			version: 1,
			pointer: 'shared/with-ok-envelope.helper#withOkEnvelope',
			read: (fixture) => OK_OUTPUT.safeParse(fixture).success,
		},
		migrations: [],
		fixtures: { 1: { ok: true } },
		note: 'tool output schemas are not versioned; only the current reader is recorded',
	},
	{
		id: 'stable-manifest',
		owner: ['packages/core/src/lib/api/stable-manifest.ts'],
		introducedAt: 1,
		currentVersion: Number(SCHEMA_VERSION),
		previousReaders: [],
		currentReader: {
			version: Number(SCHEMA_VERSION),
			pointer: 'api/stable-manifest#SCHEMA_VERSION',
			read: (fixture) =>
				(fixture as { schema?: unknown } | null)?.schema ===
				SCHEMA_VERSION,
		},
		migrations: [],
		fixtures: { 1: { schema: SCHEMA_VERSION } },
		note: 'only the current version of the stable manifest is recorded',
	},
	{
		id: 'idempotency-snapshot',
		owner: ['packages/core/src/lib/mutations/idempotency.ts'],
		introducedAt: 1,
		currentVersion: 1,
		previousReaders: [],
		currentReader: {
			version: 1,
			pointer: 'mutations/idempotency#createIdempotencyStore',
			read: (fixture) => {
				const store = createIdempotencyStore<unknown>();
				store.hydrate(fixture as Parameters<typeof store.hydrate>[0]);
				return store.size() > 0;
			},
		},
		migrations: [],
		fixtures: {
			1: {
				version: 1,
				records: [
					{
						key: 'k',
						value: 1,
						storedAt: 0,
						expiresAt: Number.MAX_SAFE_INTEGER,
					},
				],
				duplicateSuppressed: 0,
			},
		},
		note: 'a snapshot of another version is dropped, never migrated; the file-lock table is outside core and not recorded here',
	},
];
