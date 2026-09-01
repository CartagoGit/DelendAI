import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import type {
	ICacheEvictionRegistry,
	ICacheEvictionReport,
} from '../contracts/interfaces/cache-eviction.interface';
import type {
	EvidenceType,
	IEvidenceStore,
} from '../contracts/interfaces/evidence.interface';
import { writeFileAtomic } from '../shared/atomic-write';

export const EVIDENCE_TYPES: readonly EvidenceType[] = [
	'startup-report',
	'surface',
	'skills',
	'verification',
	'diagnostic',
];

const EVIDENCE_OWNER = 'core:evidence';
const EVIDENCE_TYPE_RE = /^[a-z][a-z0-9-]*$/u;
const FILE_NAME_RE = /^[a-z0-9][a-z0-9._-]*\.json$/u;

export interface IEvidenceStoreOptions {
	readonly evidenceRootAbs: string;
	readonly evictionRegistry: ICacheEvictionRegistry;
	readonly retentionDays: number;
}

export interface IEvidenceStoreWithCleanup extends IEvidenceStore {
	cleanup(
		mode?: 'on-boot' | 'dry-run' | 'off',
	): Promise<ICacheEvictionReport>;
}

const emptyReport = (): ICacheEvictionReport => ({
	dryRun: true,
	appliedAt: new Date().toISOString(),
	totalBytes: 0,
	removed: [],
	skipped: [],
	errors: [],
	rulesEvaluated: 0,
});

const registerRule = (
	registry: ICacheEvictionRegistry,
	type: EvidenceType,
	retentionDays: number,
): void => {
	registry.register({
		id: `core-evidence-${type}`,
		owner: EVIDENCE_OWNER,
		path: `evidence/${type}/*`,
		when: { kind: 'olderThanMtimeDays', days: retentionDays },
	});
};

export const createEvidenceStore = (
	options: IEvidenceStoreOptions,
): IEvidenceStoreWithCleanup => {
	if (!Number.isInteger(options.retentionDays) || options.retentionDays < 1) {
		throw new Error('evidence retentionDays must be a positive integer');
	}
	let rulesRegistered = false;
	const registerRules = (): void => {
		if (rulesRegistered) return;
		for (const type of EVIDENCE_TYPES) {
			registerRule(options.evictionRegistry, type, options.retentionDays);
		}
		rulesRegistered = true;
	};

	return {
		rootDir: options.evidenceRootAbs,
		async ensureLayout() {
			await mkdir(options.evidenceRootAbs, { recursive: true });
			await Promise.all(
				EVIDENCE_TYPES.map((type) =>
					mkdir(join(options.evidenceRootAbs, type), {
						recursive: true,
					}),
				),
			);
		},
		async write(type, payload, input = {}) {
			if (
				!EVIDENCE_TYPE_RE.test(type) ||
				!(EVIDENCE_TYPES as readonly string[]).includes(type)
			) {
				throw new Error(`invalid evidence type: ${type}`);
			}
			const recordedAt = input.recordedAt ?? new Date();
			const fileName =
				input.fileName ??
				`${recordedAt.toISOString().replace(/[:.]/gu, '-').toLowerCase()}.json`;
			if (!FILE_NAME_RE.test(fileName)) {
				throw new Error(`invalid evidence file name: ${fileName}`);
			}
			const absolutePath = join(options.evidenceRootAbs, type, fileName);
			const envelope = {
				schemaVersion: 1,
				type,
				recordedAt: recordedAt.toISOString(),
				payload,
			};
			await writeFileAtomic(
				absolutePath,
				`${JSON.stringify(envelope, null, '\t')}\n`,
			);
			return absolutePath;
		},
		async cleanup(mode = 'on-boot') {
			if (mode === 'off') return emptyReport();
			registerRules();
			return options.evictionRegistry.run({
				onlyOwner: EVIDENCE_OWNER,
				dryRun: mode !== 'on-boot',
			});
		},
	};
};
