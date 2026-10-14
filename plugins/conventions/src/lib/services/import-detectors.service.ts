/**
 * One import detector per enforcing lint.
 *
 * A plugin may not import repository tooling, so the architecture report
 * cannot call the lints directly. Each detector ports one lint's scope and
 * matching instead — including what it deliberately does not flag — and
 * `import-detectors.parity.spec.ts` runs it against that lint's exported
 * finder on the same text. A generic predicate was tried first and could
 * not agree with all five: they differ in which files they read, whether
 * they skip specs, how they treat comments, and whether they match
 * per line or across a whole file.
 */
import type {
	IImportDetector,
	IImportDetectorId,
	IImportHit,
} from '../contracts/interfaces/layer-graph.interface';
import {
	ABSOLUTE_SCANNED_EXTENSIONS,
	ABSOLUTE_SPECIFIER_PATTERNS,
	CLIENT_TYPE_IMPORT,
	CONTRACTS_FORBIDDEN_EXTRA,
	FORBIDDEN_NODE_MODULES,
	INTERNAL_CORE_EXCLUDES,
	INTERNAL_CORE_FORBIDDEN,
	INTERNAL_CORE_IMPORT_SPECIFIER,
	INTERNAL_CORE_ROOTS,
	PLUGIN_STATE_DIR,
	STATE_FORBIDDEN_AT_DELENDAI,
	TEST_KIT_PACKAGE_PREFIX,
	TEST_SUPPORT_DIRECTORY,
	TEST_SUPPORT_PRODUCTION_EXTENSION,
	TEST_SUPPORT_PRODUCTION_ROOT,
	TEST_SUPPORT_SPEC_FILE,
	TEST_SUPPORT_SPECIFIERS,
} from '../contracts/constants/import-detectors.constant';

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

/** A module name or any subpath of it, quoted. */
const quotedModule = (mod: string): string =>
	`['"]${escapeRegExp(mod)}(?:/[^'"]*)?['"]`;

const lineAt = (text: string, offset: number): number =>
	text.slice(0, offset).split('\n').length;

const isCommentLine = (line: string): boolean => {
	const trimmed = line.trim();
	return trimmed.startsWith('//') || trimmed.startsWith('*');
};

/** Blank block comments, keeping every newline so lines stay true. */
const blankBlockComments = (text: string): string =>
	text.replace(/\/\*[\s\S]*?\*\//gu, (comment) =>
		comment.replace(/[^\n]/gu, ' '),
	);

const extensionOf = (relPath: string): string => {
	const slash = relPath.lastIndexOf('/');
	const dot = relPath.lastIndexOf('.');
	return dot > slash ? relPath.slice(dot) : '';
};

const contractsDetector: IImportDetector = {
	id: 'no-node-imports-in-contracts',
	inScope: (relPath) =>
		relPath.startsWith('packages/contracts/src/') &&
		relPath.endsWith('.ts') &&
		!relPath.endsWith('.spec.ts'),
	detect: (text) => {
		const modules = [
			...FORBIDDEN_NODE_MODULES,
			...CONTRACTS_FORBIDDEN_EXTRA,
		];
		const hits: IImportHit[] = [];
		text.split('\n').forEach((line, index) => {
			if (isCommentLine(line)) return;
			for (const mod of modules) {
				if (
					new RegExp(
						`(?:from|import)\\s+${quotedModule(mod)}`,
						'u',
					).test(line)
				) {
					hits.push({ line: index + 1, specifier: mod });
				}
			}
		});
		return hits;
	},
};

const stateDetector: IImportDetector = {
	id: 'no-node-imports-in-state',
	inScope: (relPath) =>
		(relPath.startsWith('packages/state/src/') ||
			PLUGIN_STATE_DIR.test(relPath)) &&
		(relPath.endsWith('.ts') || relPath.endsWith('.tsx')),
	detect: (text) => {
		const hits: IImportHit[] = [];
		const lines = blankBlockComments(text)
			.split('\n')
			.map((line) => line.replace(/\/\/.*$/u, ''));
		lines.forEach((line, index) => {
			const builtin = FORBIDDEN_NODE_MODULES.find((mod) => {
				const quoted = quotedModule(mod);
				return (
					new RegExp(`from\\s+${quoted}`, 'u').test(line) ||
					new RegExp(`import\\s+${quoted}`, 'u').test(line) ||
					new RegExp(`require\\s*\\(\\s*${quoted}`, 'u').test(line)
				);
			});
			if (builtin !== undefined) {
				hits.push({ line: index + 1, specifier: builtin });
				return;
			}
			const scoped = STATE_FORBIDDEN_AT_DELENDAI.find((mod) => {
				const quoted = quotedModule(mod);
				return (
					new RegExp(`from\\s+${quoted}`, 'u').test(line) ||
					new RegExp(`import\\s+${quoted}`, 'u').test(line)
				);
			});
			if (scoped !== undefined)
				hits.push({ line: index + 1, specifier: scoped });
		});
		return hits;
	},
};

const clientDetector: IImportDetector = {
	id: 'no-core-public-types-in-client',
	inScope: (relPath) =>
		relPath.startsWith('packages/client/src/') &&
		relPath.endsWith('.ts') &&
		!relPath.endsWith('.spec.ts') &&
		!relPath.endsWith('.test.ts'),
	detect: (text) => {
		const blanked = blankBlockComments(text)
			.split('\n')
			.map((line) => (line.trim().startsWith('//') ? '' : line))
			.join('\n');
		const hits: IImportHit[] = [];
		for (const match of blanked.matchAll(CLIENT_TYPE_IMPORT)) {
			hits.push({
				line: lineAt(blanked, match.index ?? 0),
				specifier: match[1] ?? match[2] ?? '@delendai/core',
			});
		}
		return hits;
	},
};

const internalCoreDetector: IImportDetector = {
	id: 'no-internal-core-imports',
	inScope: (relPath) =>
		INTERNAL_CORE_ROOTS.some((root) => relPath.startsWith(root)) &&
		!INTERNAL_CORE_EXCLUDES.some((prefix) => relPath.startsWith(prefix)) &&
		relPath.endsWith('.ts'),
	detect: (text) => {
		const hits: IImportHit[] = [];
		for (const match of text.matchAll(INTERNAL_CORE_IMPORT_SPECIFIER)) {
			const specifier = match[1] ?? match[2] ?? match[3];
			if (specifier === undefined) continue;
			if (
				!INTERNAL_CORE_FORBIDDEN.some((pattern) =>
					pattern.test(specifier),
				)
			) {
				continue;
			}
			hits.push({ line: lineAt(text, match.index ?? 0), specifier });
		}
		return hits;
	},
};

const isAbsoluteLocalSpecifier = (specifier: string): boolean =>
	specifier.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(specifier);

const absoluteDetector: IImportDetector = {
	id: 'no-absolute-local-imports',
	inScope: (relPath) => ABSOLUTE_SCANNED_EXTENSIONS.has(extensionOf(relPath)),
	detect: (text) => lineSpecifierHits(text, isAbsoluteLocalSpecifier),
};

/**
 * Specifiers per line, anchored exactly as `no-absolute-local-imports`
 * reads them. Shared by every per-line detector that only differs in
 * which specifier it rejects.
 */
const lineSpecifierHits = (
	text: string,
	rejects: (specifier: string) => boolean,
): IImportHit[] => {
	const hits: IImportHit[] = [];
	text.split('\n').forEach((line, index) => {
		if (isCommentLine(line)) return;
		for (const pattern of ABSOLUTE_SPECIFIER_PATTERNS) {
			const specifier = pattern.exec(line)?.[1];
			if (specifier === undefined) continue;
			if (!rejects(specifier)) continue;
			hits.push({ line: index + 1, specifier });
			break;
		}
	});
	return hits;
};

const testSupportDetector: IImportDetector = {
	id: 'no-test-support-in-production',
	inScope: (relPath) =>
		TEST_SUPPORT_PRODUCTION_ROOT.test(relPath) &&
		TEST_SUPPORT_PRODUCTION_EXTENSION.test(relPath) &&
		!TEST_SUPPORT_SPEC_FILE.test(relPath) &&
		!TEST_SUPPORT_DIRECTORY.test(relPath) &&
		!relPath.startsWith(TEST_KIT_PACKAGE_PREFIX),
	detect: (text) =>
		lineSpecifierHits(text, (specifier) =>
			TEST_SUPPORT_SPECIFIERS.some((pattern) => pattern.test(specifier)),
		),
};

const DETECTORS: readonly IImportDetector[] = [
	contractsDetector,
	stateDetector,
	clientDetector,
	internalCoreDetector,
	absoluteDetector,
	testSupportDetector,
];

/** Every detector, in a stable order. */
export const allImportDetectors = (): readonly IImportDetector[] => DETECTORS;

/** The detector that reproduces one lint. */
export const importDetectorFor = (id: IImportDetectorId): IImportDetector => {
	const detector = DETECTORS.find((candidate) => candidate.id === id);
	if (detector === undefined) throw new Error(`no import detector ${id}`);
	return detector;
};
