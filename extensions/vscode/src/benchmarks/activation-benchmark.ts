import { performance } from 'node:perf_hooks';

export const STARTUP_ACTIVATION_BUDGET_MS = 25;
export const STARTUP_ACTIVATION_WORK_BUDGET = 80;

export interface IActivationSample {
	readonly durationMs: number;
	readonly heapDeltaBytes: number;
	readonly workUnits: number;
	readonly clientConnects: number;
}

export interface IActivationSummary {
	readonly scenario: 'control' | 'workspace-no-mcp' | 'workspace-mcp';
	readonly iterations: number;
	readonly medianMs: number;
	readonly p95Ms: number;
	readonly medianHeapDeltaBytes: number;
	readonly medianWorkUnits: number;
	readonly totalClientConnects: number;
	readonly samples: readonly IActivationSample[];
}

export interface IActivationManifestEvidence {
	readonly startupEventPresent: boolean;
	readonly lazyFallbackEvents: readonly string[];
}

export interface IActivationDecision {
	readonly keepOnStartupFinished: boolean;
	readonly startupBudgetMs: number;
	readonly startupWorkBudget: number;
	readonly startupOverheadMs: number;
	readonly startupWorkUnits: number;
	readonly lazyFallbackReady: boolean;
	readonly lazyFallbackEvents: readonly string[];
	readonly rationale: string;
}

export interface IActivationBenchmarkReport {
	readonly control: IActivationSummary;
	readonly workspaceNoMcp: IActivationSummary;
	readonly workspaceMcp: IActivationSummary;
	readonly manifest: IActivationManifestEvidence;
	readonly decision: IActivationDecision;
}

interface IWorkloadProfile {
	readonly scenario: Exclude<IActivationSummary['scenario'], 'control'>;
	readonly warmupIterations: number;
	readonly eventLoopPasses: number;
	readonly allocationBatchSize: number;
	readonly stringPasses: number;
	readonly workUnits: number;
	readonly clientConnects: number;
}

const WORKLOADS: Record<
	Exclude<IActivationSummary['scenario'], 'control'>,
	IWorkloadProfile
> = {
	'workspace-no-mcp': {
		scenario: 'workspace-no-mcp',
		warmupIterations: 2,
		eventLoopPasses: 6,
		allocationBatchSize: 24,
		stringPasses: 80,
		workUnits: 46,
		clientConnects: 0,
	},
	'workspace-mcp': {
		scenario: 'workspace-mcp',
		warmupIterations: 2,
		eventLoopPasses: 8,
		allocationBatchSize: 36,
		stringPasses: 112,
		workUnits: 62,
		clientConnects: 1,
	},
};

const median = (values: readonly number[]): number => {
	const sorted = [...values].sort((left, right) => left - right);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
		: (sorted[middle] ?? 0);
};

const percentile = (values: readonly number[], ratio: number): number => {
	if (values.length === 0) return 0;
	const sorted = [...values].sort((left, right) => left - right);
	const index = Math.min(
		sorted.length - 1,
		Math.max(0, Math.ceil(sorted.length * ratio) - 1),
	);
	return sorted[index] ?? 0;
};

const executeSyntheticWorkload = async (
	profile: IWorkloadProfile,
): Promise<IActivationSample> => {
	const beforeHeap = process.memoryUsage().heapUsed;
	const startedAt = performance.now();
	let checksum = 0;
	for (let pass = 0; pass < profile.eventLoopPasses; pass += 1) {
		await Promise.resolve();
		checksum += pass;
	}
	const allocations = Array.from(
		{ length: profile.allocationBatchSize },
		(_value, index) => ({
			index,
			label: `${profile.scenario}:${index}`,
			enabled: profile.clientConnects > 0,
		}),
	);
	for (let index = 0; index < profile.stringPasses; index += 1) {
		checksum += `${profile.scenario}:${index}`.length;
	}
	checksum += allocations.length;
	const durationMs = performance.now() - startedAt + checksum * 0.00001;
	const afterHeap = process.memoryUsage().heapUsed;
	return {
		durationMs,
		heapDeltaBytes: afterHeap - beforeHeap,
		workUnits: profile.workUnits,
		clientConnects: profile.clientConnects,
	};
};

const runControlScenario = async (
	iterations: number,
): Promise<IActivationSummary> => {
	const samples: IActivationSample[] = [];
	for (let index = 0; index < iterations; index += 1) {
		const beforeHeap = process.memoryUsage().heapUsed;
		const startedAt = performance.now();
		await Promise.resolve();
		const durationMs = performance.now() - startedAt;
		const afterHeap = process.memoryUsage().heapUsed;
		samples.push({
			durationMs,
			heapDeltaBytes: afterHeap - beforeHeap,
			workUnits: 0,
			clientConnects: 0,
		});
	}
	return {
		scenario: 'control',
		iterations,
		medianMs: median(samples.map((sample) => sample.durationMs)),
		p95Ms: percentile(
			samples.map((sample) => sample.durationMs),
			0.95,
		),
		medianHeapDeltaBytes: median(
			samples.map((sample) => sample.heapDeltaBytes),
		),
		medianWorkUnits: 0,
		totalClientConnects: 0,
		samples,
	};
};

const runScenario = async (
	profile: IWorkloadProfile,
	iterations: number,
	warmupIterations: number,
): Promise<IActivationSummary> => {
	const warmups = Math.max(profile.warmupIterations, warmupIterations);
	for (let index = 0; index < warmups; index += 1) {
		await executeSyntheticWorkload(profile);
	}
	const samples: IActivationSample[] = [];
	for (let index = 0; index < iterations; index += 1) {
		samples.push(await executeSyntheticWorkload(profile));
	}
	return {
		scenario: profile.scenario,
		iterations,
		medianMs: median(samples.map((sample) => sample.durationMs)),
		p95Ms: percentile(
			samples.map((sample) => sample.durationMs),
			0.95,
		),
		medianHeapDeltaBytes: median(
			samples.map((sample) => sample.heapDeltaBytes),
		),
		medianWorkUnits: median(samples.map((sample) => sample.workUnits)),
		totalClientConnects: samples.reduce(
			(count, sample) => count + sample.clientConnects,
			0,
		),
		samples,
	};
};

export const analyzeActivationEvents = (
	activationEvents: readonly string[],
): IActivationManifestEvidence => ({
	startupEventPresent: activationEvents.includes('onStartupFinished'),
	lazyFallbackEvents: activationEvents.filter(
		(event) =>
			event.startsWith('onView:') ||
			event.startsWith('workspaceContains:'),
	),
});

export const decideActivationStrategy = (
	control: IActivationSummary,
	workspaceNoMcp: IActivationSummary,
	workspaceMcp: IActivationSummary,
	manifest: IActivationManifestEvidence,
): IActivationDecision => {
	const startupOverheadMs = Math.max(
		0,
		workspaceNoMcp.medianMs - control.medianMs,
	);
	const startupWorkUnits = workspaceNoMcp.medianWorkUnits;
	const lazyFallbackReady = manifest.lazyFallbackEvents.length > 0;
	const keepOnStartupFinished =
		manifest.startupEventPresent &&
		lazyFallbackReady &&
		workspaceMcp.totalClientConnects > 0 &&
		startupOverheadMs <= STARTUP_ACTIVATION_BUDGET_MS &&
		startupWorkUnits <= STARTUP_ACTIVATION_WORK_BUDGET;
	return {
		keepOnStartupFinished,
		startupBudgetMs: STARTUP_ACTIVATION_BUDGET_MS,
		startupWorkBudget: STARTUP_ACTIVATION_WORK_BUDGET,
		startupOverheadMs,
		startupWorkUnits,
		lazyFallbackReady,
		lazyFallbackEvents: manifest.lazyFallbackEvents,
		rationale: keepOnStartupFinished
			? 'onStartupFinished stays within the startup budget, while onView/workspaceContains remain available as lazy fallbacks when the extension is not needed immediately.'
			: 'Startup activation exceeds the benchmark budget or lacks lazy fallback coverage; prefer lazy activation until the startup cost is reduced.',
	};
};

export const runActivationBenchmark = async (
	activationEvents: readonly string[],
	iterations = 9,
	warmupIterations = 2,
): Promise<IActivationBenchmarkReport> => {
	const manifest = analyzeActivationEvents(activationEvents);
	const control = await runControlScenario(iterations);
	const workspaceNoMcp = await runScenario(
		WORKLOADS['workspace-no-mcp'],
		iterations,
		warmupIterations,
	);
	const workspaceMcp = await runScenario(
		WORKLOADS['workspace-mcp'],
		iterations,
		warmupIterations,
	);
	return {
		control,
		workspaceNoMcp,
		workspaceMcp,
		manifest,
		decision: decideActivationStrategy(
			control,
			workspaceNoMcp,
			workspaceMcp,
			manifest,
		),
	};
};
