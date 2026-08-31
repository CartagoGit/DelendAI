import type {
	ContractMigrationImpact,
	ContractMigrationPhase,
	IWorktreeImpactPolicyInput,
	IWorktreeImpactPolicyVerdict,
} from '@mcp-vertex/core/lib/contracts';

const HIGH_FANOUT_FILE_THRESHOLD = 6;
const HIGH_FANOUT_AREA_THRESHOLD = 3;
const LATE_PHASE_FILE_THRESHOLD = 4;

const LATE_PHASES: ReadonlySet<ContractMigrationPhase> = new Set([
	'regenerate',
	'consumers',
	'verify',
	'contract',
]);

const normalizePaths = (paths: readonly string[]): readonly string[] => [
	...new Set(
		paths.map((path) => path.trim()).filter((path) => path.length > 0),
	),
];

const classifyArea = (path: string): string => {
	const parts = path.split('/').filter((part) => part.length > 0);
	if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
	return parts[0] ?? path;
};

const isContractPath = (path: string): boolean =>
	path.includes('/contracts/') ||
	path.endsWith('.contract.ts') ||
	path.endsWith('.interface.ts');

const buildVerdict = (
	impact: ContractMigrationImpact,
	reasons: readonly string[],
	fileCount: number,
	areaCount: number,
	contractTouchCount: number,
): IWorktreeImpactPolicyVerdict => ({
	impact,
	isolation: impact === 'high' ? 'agent-worktree' : 'shared-checkout',
	claimMode:
		impact === 'high' ? 'requires-agent-worktree' : 'shared-checkout-ok',
	reasons,
	fileCount,
	areaCount,
	contractTouchCount,
});

export const evaluateWorktreeImpactPolicy = (
	input: IWorktreeImpactPolicyInput,
): IWorktreeImpactPolicyVerdict => {
	const touchedPaths = normalizePaths(input.touchedPaths);
	const fileCount = touchedPaths.length;
	const areaCount = new Set(touchedPaths.map(classifyArea)).size;
	const contractTouchCount = touchedPaths.filter(isContractPath).length;
	const reasons: string[] = [];

	if (fileCount >= HIGH_FANOUT_FILE_THRESHOLD) {
		reasons.push(
			`fan-out touches ${fileCount} paths (threshold ${HIGH_FANOUT_FILE_THRESHOLD})`,
		);
	}
	if (areaCount >= HIGH_FANOUT_AREA_THRESHOLD) {
		reasons.push(
			`fan-out spans ${areaCount} top-level areas (threshold ${HIGH_FANOUT_AREA_THRESHOLD})`,
		);
	}
	if (
		LATE_PHASES.has(input.phase) &&
		contractTouchCount > 0 &&
		areaCount >= 2
	) {
		reasons.push(
			`${input.phase} crosses contract and consumer areas, so the migration should isolate git state`,
		);
	}
	if (
		LATE_PHASES.has(input.phase) &&
		(fileCount >= LATE_PHASE_FILE_THRESHOLD || areaCount >= 2)
	) {
		reasons.push(
			`${input.phase} is a late migration phase with multi-surface fan-out`,
		);
	}
	if (contractTouchCount >= 2 && areaCount >= 2) {
		reasons.push(
			`multiple contract surfaces (${contractTouchCount}) move together across ${areaCount} areas`,
		);
	}

	if (reasons.length > 0) {
		return buildVerdict(
			'high',
			reasons,
			fileCount,
			areaCount,
			contractTouchCount,
		);
	}

	if (contractTouchCount >= 2 || areaCount >= 2 || fileCount >= 3) {
		return buildVerdict(
			'medium',
			[
				'change touches more than one surface but does not cross the high fan-out isolation threshold',
			],
			fileCount,
			areaCount,
			contractTouchCount,
		);
	}

	return buildVerdict(
		'low',
		['single-surface change stays on the shared checkout'],
		fileCount,
		areaCount,
		contractTouchCount,
	);
};
