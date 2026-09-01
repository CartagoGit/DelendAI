import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

export const STARTUP_ACTIVATION_BUDGET_MS = 25;
export const STARTUP_ACTIVATION_WORK_BUDGET = 80;

const here = dirname(fileURLToPath(import.meta.url));
const defaultExtensionRoot = resolve(here, '../..');
const defaultIntegrationRunnerPath = resolve(
	defaultExtensionRoot,
	'src/test/activation-benchmark.integration.cjs',
);
const defaultControlExtensionPath = resolve(
	defaultExtensionRoot,
	'src/test/fixtures/activation/control-extension',
);
const defaultControlWorkspacePath = resolve(
	defaultExtensionRoot,
	'src/test/fixtures/activation/control-workspace',
);
const defaultNoMcpWorkspacePath = resolve(
	defaultExtensionRoot,
	'src/test/fixtures/activation/no-mcp-workspace',
);
const defaultMcpWorkspacePath = resolve(
	defaultExtensionRoot,
	'src/test/fixtures/activation/mcp-workspace',
);
const requireFromHere = createRequire(import.meta.url);

export const ACTIVATION_SCENARIOS = [
	'control',
	'workspace-no-mcp',
	'workspace-mcp',
] as const;

export type TActivationScenario = (typeof ACTIVATION_SCENARIOS)[number];

export interface IActivationManifestEvidence {
	readonly startupEventPresent: boolean;
	readonly lazyFallbackEvents: readonly string[];
	readonly fallbackDocumentation: string;
}

export interface IActivationScenarioSample {
	readonly scenario: TActivationScenario;
	readonly startupReadyMs: number;
	readonly activationProbeMs: number | null;
	readonly heapUsedBytes: number;
	readonly heapDeltaBytes: number;
	readonly workUnits: number;
	readonly observedToolCalls: number | null;
	readonly observedToolCallsEvidence: 'artifact' | 'missing-artifact';
	readonly activatedBeforeProbe: boolean;
	readonly activationEvents: readonly string[];
	readonly limitation: null;
}

export interface IActivationSummary {
	readonly scenario: TActivationScenario;
	readonly iterations: number;
	readonly medianStartupReadyMs: number;
	readonly p95StartupReadyMs: number;
	readonly medianActivationProbeMs: number;
	readonly medianHeapUsedBytes: number;
	readonly medianHeapDeltaBytes: number;
	readonly medianWorkUnits: number;
	readonly totalObservedToolCalls: number | null;
	readonly missingObservedToolCallEvidenceCount: number;
	readonly activatedBeforeProbeCount: number;
	readonly samples: readonly IActivationScenarioSample[];
}

export interface IActivationHarnessLimitation {
	readonly phase: 'dependency' | 'build' | 'launch' | 'probe';
	readonly reason:
		| 'missing-official-harness'
		| 'vscode-download-blocked'
		| 'vscode-runtime-unavailable'
		| 'scenario-probe-failed';
	readonly message: string;
	readonly scenario?: TActivationScenario;
}

export interface IActivationDecision {
	readonly status: 'measured' | 'insufficient-evidence';
	readonly keepOnStartupFinished: boolean | null;
	readonly startupBudgetMs: number;
	readonly startupWorkBudget: number;
	readonly startupOverheadMs: number | null;
	readonly startupWorkUnits: number | null;
	readonly lazyFallbackReady: boolean;
	readonly lazyFallbackEvents: readonly string[];
	readonly rationale: string;
}

export interface IActivationBenchmarkReport {
	readonly harness: {
		readonly mode: 'official-vscode-test-electron' | 'limitation';
		readonly officialHarness: '@vscode/test-electron';
		readonly iterations: number;
		readonly runner: string;
		readonly evidenceDir?: string;
		readonly limitation?: IActivationHarnessLimitation;
	};
	readonly manifest: IActivationManifestEvidence;
	readonly control: IActivationSummary | null;
	readonly workspaceNoMcp: IActivationSummary | null;
	readonly workspaceMcp: IActivationSummary | null;
	readonly decision: IActivationDecision;
}

interface IScenarioBenchmarkRequest {
	readonly scenario: TActivationScenario;
	readonly iteration: number;
	readonly extensionDevelopmentPath: string;
	readonly extensionId: string;
	readonly workspacePath: string;
	readonly integrationRunnerPath: string;
	readonly evidenceDir: string;
	readonly callLogPath?: string;
}

interface IScenarioProbeFile {
	readonly scenario: TActivationScenario;
	readonly activationProbeMs: number | null;
	readonly heapUsedBytes: number;
	readonly heapDeltaBytes: number;
	readonly workUnits: number;
	readonly observedToolCalls?: number | null;
	readonly observedToolCallsEvidence?: 'artifact' | 'missing-artifact';
	readonly activatedBeforeProbe: boolean;
	readonly activationEvents: readonly string[];
}

interface IObservedToolCallEvidence {
	readonly observedToolCalls: number | null;
	readonly observedToolCallsEvidence: 'artifact' | 'missing-artifact';
}

type TRunTests = (input: {
	extensionDevelopmentPath: string;
	extensionTestsPath: string;
	launchArgs: readonly string[];
	extensionTestsEnv: NodeJS.ProcessEnv;
}) => Promise<void>;

export interface IActivationBenchmarkOptions {
	readonly iterations?: number;
	readonly activationEvents?: readonly string[];
	readonly extensionRoot?: string;
	readonly integrationRunnerPath?: string;
	readonly keepEvidence?: boolean;
	readonly build?: boolean;
	readonly executeScenario?: (
		request: IScenarioBenchmarkRequest,
	) => Promise<IActivationScenarioSample>;
}

const median = (values: readonly number[]): number => {
	if (values.length === 0) return 0;
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

export const analyzeActivationEvents = (
	activationEvents: readonly string[],
): IActivationManifestEvidence => {
	const lazyFallbackEvents = activationEvents.filter(
		(event) =>
			event.startsWith('onView:') ||
			event.startsWith('workspaceContains:'),
	);
	return {
		startupEventPresent: activationEvents.includes('onStartupFinished'),
		lazyFallbackEvents,
		fallbackDocumentation:
			lazyFallbackEvents.length > 0
				? `Lazy fallback remains declared through ${lazyFallbackEvents.join(', ')} while onStartupFinished covers eager startup.`
				: 'No lazy fallback activation event is declared in the manifest.',
	};
};

const readObservedToolCalls = async (
	path?: string,
): Promise<IObservedToolCallEvidence> => {
	if (path === undefined) {
		return {
			observedToolCalls: null,
			observedToolCallsEvidence: 'missing-artifact',
		};
	}
	try {
		const raw = await readFile(path, 'utf8');
		const lines = raw
			.split('\n')
			.map((line) => line.trim())
			.filter((line) => line.length > 0);
		if (lines.length === 0) {
			return {
				observedToolCalls: null,
				observedToolCallsEvidence: 'missing-artifact',
			};
		}
		return {
			observedToolCalls: lines.length,
			observedToolCallsEvidence: 'artifact',
		};
	} catch {
		return {
			observedToolCalls: null,
			observedToolCallsEvidence: 'missing-artifact',
		};
	}
};

const summarizeScenario = (
	scenario: TActivationScenario,
	samples: readonly IActivationScenarioSample[],
): IActivationSummary => {
	const missingObservedToolCallEvidenceCount = samples.filter(
		(sample) => sample.observedToolCallsEvidence !== 'artifact',
	).length;
	return {
		scenario,
		iterations: samples.length,
		medianStartupReadyMs: median(
			samples.map((sample) => sample.startupReadyMs),
		),
		p95StartupReadyMs: percentile(
			samples.map((sample) => sample.startupReadyMs),
			0.95,
		),
		medianActivationProbeMs: median(
			samples.map((sample) => sample.activationProbeMs ?? 0),
		),
		medianHeapUsedBytes: median(
			samples.map((sample) => sample.heapUsedBytes),
		),
		medianHeapDeltaBytes: median(
			samples.map((sample) => sample.heapDeltaBytes),
		),
		medianWorkUnits: median(samples.map((sample) => sample.workUnits)),
		totalObservedToolCalls:
			missingObservedToolCallEvidenceCount === 0
				? samples.reduce(
						(count, sample) =>
							count + (sample.observedToolCalls ?? 0),
						0,
					)
				: null,
		missingObservedToolCallEvidenceCount,
		activatedBeforeProbeCount: samples.reduce(
			(count, sample) => count + (sample.activatedBeforeProbe ? 1 : 0),
			0,
		),
		samples,
	};
};

const classifyHarnessLimitation = (
	message: string,
	phase: IActivationHarnessLimitation['phase'],
	scenario?: TActivationScenario,
): IActivationHarnessLimitation => {
	const normalized = message.toLowerCase();
	const reason =
		normalized.includes('@vscode/test-electron') &&
		(normalized.includes('cannot find package') ||
			normalized.includes('cannot find module'))
			? 'missing-official-harness'
			: normalized.includes('getaddrinfo') ||
					normalized.includes('download') ||
					normalized.includes('fetch failed')
				? 'vscode-download-blocked'
				: normalized.includes('libgtk') ||
						normalized.includes('sandbox') ||
						normalized.includes('display') ||
						normalized.includes('x server')
					? 'vscode-runtime-unavailable'
					: 'scenario-probe-failed';
	return {
		phase,
		reason,
		message,
		...(scenario === undefined ? {} : { scenario }),
	};
};

const createInsufficientEvidenceDecision = (
	manifest: IActivationManifestEvidence,
	limitation: IActivationHarnessLimitation,
): IActivationDecision => ({
	status: 'insufficient-evidence',
	keepOnStartupFinished: null,
	startupBudgetMs: STARTUP_ACTIVATION_BUDGET_MS,
	startupWorkBudget: STARTUP_ACTIVATION_WORK_BUDGET,
	startupOverheadMs: null,
	startupWorkUnits: null,
	lazyFallbackReady: manifest.lazyFallbackEvents.length > 0,
	lazyFallbackEvents: manifest.lazyFallbackEvents,
	rationale: `The benchmark attempted the official @vscode/test-electron harness but stopped during ${limitation.phase}: ${limitation.message}. No real VS Code activation evidence was collected, so this run cannot justify onStartupFinished; ${manifest.fallbackDocumentation}`,
});

const createMissingObservedCallsDecision = (
	manifest: IActivationManifestEvidence,
	summaries: readonly IActivationSummary[],
): IActivationDecision => {
	const missingScenarios = summaries
		.filter((summary) => summary.missingObservedToolCallEvidenceCount > 0)
		.map((summary) => summary.scenario);
	return {
		status: 'insufficient-evidence',
		keepOnStartupFinished: null,
		startupBudgetMs: STARTUP_ACTIVATION_BUDGET_MS,
		startupWorkBudget: STARTUP_ACTIVATION_WORK_BUDGET,
		startupOverheadMs: null,
		startupWorkUnits: null,
		lazyFallbackReady: manifest.lazyFallbackEvents.length > 0,
		lazyFallbackEvents: manifest.lazyFallbackEvents,
		rationale: `The official @vscode/test-electron harness ran, but observedToolCalls evidence is missing for ${missingScenarios.join(', ')}. The benchmark must observe control, no-MCP, and MCP scenarios from a real instrumentation artifact before it can justify onStartupFinished; ${manifest.fallbackDocumentation}`,
	};
};

export const decideActivationStrategy = (
	control: IActivationSummary,
	workspaceNoMcp: IActivationSummary,
	workspaceMcp: IActivationSummary,
	manifest: IActivationManifestEvidence,
): IActivationDecision => {
	if (
		control.missingObservedToolCallEvidenceCount > 0 ||
		workspaceNoMcp.missingObservedToolCallEvidenceCount > 0 ||
		workspaceMcp.missingObservedToolCallEvidenceCount > 0
	) {
		return createMissingObservedCallsDecision(manifest, [
			control,
			workspaceNoMcp,
			workspaceMcp,
		]);
	}
	const startupOverheadMs = Math.max(
		0,
		workspaceNoMcp.medianStartupReadyMs - control.medianStartupReadyMs,
	);
	const startupWorkUnits = workspaceNoMcp.medianWorkUnits;
	const workspaceNoMcpObservedToolCalls =
		workspaceNoMcp.totalObservedToolCalls ?? 0;
	const workspaceMcpObservedToolCalls =
		workspaceMcp.totalObservedToolCalls ?? 0;
	const lazyFallbackReady = manifest.lazyFallbackEvents.length > 0;
	const keepOnStartupFinished =
		manifest.startupEventPresent &&
		lazyFallbackReady &&
		workspaceNoMcpObservedToolCalls === 0 &&
		workspaceMcpObservedToolCalls > 0 &&
		startupOverheadMs <= STARTUP_ACTIVATION_BUDGET_MS &&
		startupWorkUnits <= STARTUP_ACTIVATION_WORK_BUDGET;
	return {
		status: 'measured',
		keepOnStartupFinished,
		startupBudgetMs: STARTUP_ACTIVATION_BUDGET_MS,
		startupWorkBudget: STARTUP_ACTIVATION_WORK_BUDGET,
		startupOverheadMs,
		startupWorkUnits,
		lazyFallbackReady,
		lazyFallbackEvents: manifest.lazyFallbackEvents,
		rationale: keepOnStartupFinished
			? `Official VS Code extension-host measurements stayed within the startup budget, the no-MCP workspace made no observed MCP calls, the MCP workspace did, and ${manifest.fallbackDocumentation}`
			: `Official VS Code extension-host measurements do not yet support onStartupFinished under the configured budgets or observed-call expectations; ${manifest.fallbackDocumentation}`,
	};
};

const readActivationEventsFromManifest = async (
	manifestPath: string,
): Promise<readonly string[]> => {
	const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as {
		activationEvents?: readonly string[];
	};
	return manifest.activationEvents ?? [];
};

const buildExtensionBundle = (extensionRoot: string): void => {
	const result = spawnSync('bun', ['run', 'build'], {
		cwd: extensionRoot,
		encoding: 'utf8',
		stdio: 'pipe',
	});
	if (result.status === 0) return;
	const stderr = result.stderr?.trim();
	const stdout = result.stdout?.trim();
	throw new Error(stderr || stdout || 'bun run build failed');
};

const executeVsCodeScenario = async (
	request: IScenarioBenchmarkRequest,
): Promise<IActivationScenarioSample> => {
	let runTests: TRunTests | null = null;
	try {
		const loaded = requireFromHere('@vscode/test-electron') as {
			runTests?: TRunTests;
		};
		runTests = loaded.runTests ?? null;
	} catch (error) {
		throw classifyHarnessLimitation(
			error instanceof Error ? error.message : String(error),
			'dependency',
			request.scenario,
		);
	}
	if (runTests === null) {
		throw classifyHarnessLimitation(
			'@vscode/test-electron did not expose runTests',
			'dependency',
			request.scenario,
		);
	}
	const outputFile = join(
		request.evidenceDir,
		`${request.scenario}-${request.iteration}.json`,
	);
	const startedAt = performance.now();
	try {
		await runTests({
			extensionDevelopmentPath: request.extensionDevelopmentPath,
			extensionTestsPath: request.integrationRunnerPath,
			launchArgs: [request.workspacePath, '--disable-workspace-trust'],
			extensionTestsEnv: {
				...process.env,
				MCP_VERTEX_BENCH_OUTPUT_FILE: outputFile,
				MCP_VERTEX_BENCH_EXTENSION_ID: request.extensionId,
				MCP_VERTEX_BENCH_SCENARIO: request.scenario,
				...(request.callLogPath === undefined
					? {}
					: { MCP_VERTEX_BENCH_CALL_LOG: request.callLogPath }),
			},
		});
	} catch (error) {
		if (
			typeof error === 'object' &&
			error !== null &&
			'phase' in error &&
			'reason' in error
		) {
			throw error;
		}
		throw classifyHarnessLimitation(
			error instanceof Error ? error.message : String(error),
			'launch',
			request.scenario,
		);
	}
	let probe: IScenarioProbeFile;
	try {
		probe = JSON.parse(
			await readFile(outputFile, 'utf8'),
		) as IScenarioProbeFile;
	} catch (error) {
		throw classifyHarnessLimitation(
			error instanceof Error ? error.message : String(error),
			'probe',
			request.scenario,
		);
	}
	const observedToolCallEvidence = await readObservedToolCalls(
		request.callLogPath,
	);
	return {
		scenario: request.scenario,
		startupReadyMs: performance.now() - startedAt,
		activationProbeMs: probe.activationProbeMs,
		heapUsedBytes: probe.heapUsedBytes,
		heapDeltaBytes: probe.heapDeltaBytes,
		workUnits: probe.workUnits,
		observedToolCalls:
			probe.observedToolCalls ??
			observedToolCallEvidence.observedToolCalls,
		observedToolCallsEvidence:
			probe.observedToolCallsEvidence ??
			observedToolCallEvidence.observedToolCallsEvidence,
		activatedBeforeProbe: probe.activatedBeforeProbe,
		activationEvents: probe.activationEvents,
		limitation: null,
	};
};

export const runActivationBenchmark = async (
	options: IActivationBenchmarkOptions = {},
): Promise<IActivationBenchmarkReport> => {
	const extensionRoot = options.extensionRoot ?? defaultExtensionRoot;
	const manifestPath = resolve(extensionRoot, 'package.json');
	const activationEvents =
		options.activationEvents ??
		(await readActivationEventsFromManifest(manifestPath));
	const manifest = analyzeActivationEvents(activationEvents);
	const iterations = Math.max(1, options.iterations ?? 3);
	const integrationRunnerPath =
		options.integrationRunnerPath ?? defaultIntegrationRunnerPath;
	const executeScenario = options.executeScenario ?? executeVsCodeScenario;
	const evidenceDir = await mkdtemp(
		join(tmpdir(), 'mcp-vertex-vscode-activation-benchmark-'),
	);
	const cleanup = async (): Promise<void> => {
		if (options.keepEvidence === true) return;
		await rm(evidenceDir, { recursive: true, force: true });
	};
	try {
		if (options.build !== false) {
			try {
				buildExtensionBundle(extensionRoot);
			} catch (error) {
				const limitation = classifyHarnessLimitation(
					error instanceof Error ? error.message : String(error),
					'build',
				);
				return {
					harness: {
						mode: 'limitation',
						officialHarness: '@vscode/test-electron',
						iterations,
						runner: integrationRunnerPath,
						evidenceDir,
						limitation,
					},
					manifest,
					control: null,
					workspaceNoMcp: null,
					workspaceMcp: null,
					decision: createInsufficientEvidenceDecision(
						manifest,
						limitation,
					),
				};
			}
		}

		const samples = new Map<
			TActivationScenario,
			IActivationScenarioSample[]
		>();
		for (const scenario of ACTIVATION_SCENARIOS) {
			samples.set(scenario, []);
		}
		for (let iteration = 1; iteration <= iterations; iteration += 1) {
			for (const scenario of ACTIVATION_SCENARIOS) {
				const request: IScenarioBenchmarkRequest = {
					scenario,
					iteration,
					extensionDevelopmentPath:
						scenario === 'control'
							? defaultControlExtensionPath
							: extensionRoot,
					extensionId:
						scenario === 'control'
							? 'cartago.mcp-vertex-benchmark-control'
							: 'cartago.mcp-vertex-vscode',
					workspacePath:
						scenario === 'control'
							? defaultControlWorkspacePath
							: scenario === 'workspace-no-mcp'
								? defaultNoMcpWorkspacePath
								: defaultMcpWorkspacePath,
					integrationRunnerPath,
					evidenceDir,
					callLogPath: join(
						evidenceDir,
						`${scenario}-${iteration}.jsonl`,
					),
				};
				try {
					samples.get(scenario)?.push(await executeScenario(request));
				} catch (error) {
					const limitation =
						typeof error === 'object' &&
						error !== null &&
						'phase' in error &&
						'reason' in error &&
						'message' in error
							? (error as IActivationHarnessLimitation)
							: classifyHarnessLimitation(
									error instanceof Error
										? error.message
										: String(error),
									'launch',
									scenario,
								);
					return {
						harness: {
							mode: 'limitation',
							officialHarness: '@vscode/test-electron',
							iterations,
							runner: integrationRunnerPath,
							evidenceDir,
							limitation,
						},
						manifest,
						control: null,
						workspaceNoMcp: null,
						workspaceMcp: null,
						decision: createInsufficientEvidenceDecision(
							manifest,
							limitation,
						),
					};
				}
			}
		}

		const control = summarizeScenario(
			'control',
			samples.get('control') ?? [],
		);
		const workspaceNoMcp = summarizeScenario(
			'workspace-no-mcp',
			samples.get('workspace-no-mcp') ?? [],
		);
		const workspaceMcp = summarizeScenario(
			'workspace-mcp',
			samples.get('workspace-mcp') ?? [],
		);
		return {
			harness: {
				mode: 'official-vscode-test-electron',
				officialHarness: '@vscode/test-electron',
				iterations,
				runner: integrationRunnerPath,
				evidenceDir,
			},
			manifest,
			control,
			workspaceNoMcp,
			workspaceMcp,
			decision: decideActivationStrategy(
				control,
				workspaceNoMcp,
				workspaceMcp,
				manifest,
			),
		};
	} finally {
		await cleanup();
	}
};
