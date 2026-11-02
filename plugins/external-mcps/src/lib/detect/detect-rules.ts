/**
 * detect-rules.ts — the generic detection engine + seed rules (f00068 S4).
 *
 * Detection is an ANNOTATION-ONLY signal. A rule that fires marks the
 * matching catalog id with `detected: true` in the `catalog`/`suggest`
 * output so the LLM knows "this workspace already uses the thing this
 * server composes". It NEVER activates a server: activation stays fully
 * governed by the autonomy knobs (`llmDecidesActivation` +
 * `requireHumanAckWhenLlmDecides`). A detected server is still just a
 * candidate the human/LLM may choose to declare and ack.
 *
 * The engine is pure over its `IDetectEvidence` input. The only I/O is
 * the workspace `package.json` read in {@link loadDetectEvidence}, which
 * takes the workspace root explicitly (no `process.cwd()` — AGENTS
 * invariant) and NEVER throws: a missing or malformed manifest yields
 * empty evidence, so detection degrades to "nothing detected".
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/** The `package.json` dependency maps a rule may probe. */
export interface IPackageJsonEvidence {
	readonly dependencies?: Readonly<Record<string, string>>;
	readonly devDependencies?: Readonly<Record<string, string>>;
	readonly peerDependencies?: Readonly<Record<string, string>>;
}

/** Everything the workspace tells us, gathered once and passed to every rule. */
export interface IDetectEvidence {
	readonly packageJson?: IPackageJsonEvidence;
}

/** One detection rule: a pure predicate mapping evidence → a catalog id. */
export interface IDetectRule {
	/** The catalog id this rule annotates when it fires. */
	readonly catalogId: string;
	/** Human-readable probe (documentation + debugging only). */
	readonly probe: string;
	/** Pure predicate over the gathered evidence. */
	readonly matches: (evidence: IDetectEvidence) => boolean;
}

/** True when `name` appears in any of the manifest's dependency maps. */
export const hasDependency = (
	evidence: IDetectEvidence,
	name: string,
): boolean => {
	const pkg = evidence.packageJson;
	if (pkg === undefined) return false;
	return (
		pkg.dependencies?.[name] !== undefined ||
		pkg.devDependencies?.[name] !== undefined ||
		pkg.peerDependencies?.[name] !== undefined
	);
};

/**
 * The seed rule set. Angular is the reference probe from the proposal:
 * a workspace that depends on `@angular/core` is an Angular workspace,
 * so the `angular` catalog entry is annotated `detected: true`.
 */
export const DETECT_RULES: readonly IDetectRule[] = [
	{
		catalogId: 'angular',
		probe: "package.json#dependencies['@angular/core']",
		matches: (evidence) => hasDependency(evidence, '@angular/core'),
	},
];

/**
 * Run every rule against the evidence and return the set of catalog ids
 * that fired. Pure: no I/O, deterministic, order-independent.
 */
export const detectCatalogIds = (
	evidence: IDetectEvidence,
	rules: readonly IDetectRule[] = DETECT_RULES,
): ReadonlySet<string> => {
	const detected = new Set<string>();
	for (const rule of rules) {
		if (rule.matches(evidence)) detected.add(rule.catalogId);
	}
	return detected;
};

/** Extract the dependency maps from a raw `package.json` string. Never throws. */
export const parsePackageJsonEvidence = (raw: string): IDetectEvidence => {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return {};
	}
	if (typeof parsed !== 'object' || parsed === null) return {};
	const record = parsed as Record<string, unknown>;
	const pick = (key: string): Record<string, string> | undefined => {
		const value = record[key];
		return typeof value === 'object' && value !== null
			? (value as Record<string, string>)
			: undefined;
	};
	const packageJson: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
		peerDependencies?: Record<string, string>;
	} = {};
	const dependencies = pick('dependencies');
	if (dependencies !== undefined) packageJson.dependencies = dependencies;
	const devDependencies = pick('devDependencies');
	if (devDependencies !== undefined)
		packageJson.devDependencies = devDependencies;
	const peerDependencies = pick('peerDependencies');
	if (peerDependencies !== undefined)
		packageJson.peerDependencies = peerDependencies;
	return { packageJson };
};

/**
 * Gather detection evidence from the workspace `package.json`. The read
 * is injectable for tests; the default reads the real file. Takes the
 * workspace root explicitly (never `process.cwd()`) and returns empty
 * evidence on any error — detection is best-effort and never a hard fail.
 */
export const loadDetectEvidence = async (
	workspaceRoot: string,
	read: (path: string) => Promise<string> = (path) => readFile(path, 'utf8'),
): Promise<IDetectEvidence> => {
	try {
		const raw = await read(join(workspaceRoot, 'package.json'));
		return parsePackageJsonEvidence(raw);
	} catch {
		return {};
	}
};
