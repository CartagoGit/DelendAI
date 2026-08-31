import type { IToolRegistration } from '@mcp-vertex/core/public';

import { realReadLocalCorrelateDeps } from '../correlate';
import type { IRuntimeMetricsRegistry } from '../contracts/interfaces/observability.interface';
import { listRecentErrors } from '../errors/list-errors';
import type { IErrorSource } from '../errors/ierror-source';
import { buildObsCorrelateToolRegistration } from './obs-correlate.tool';
import { buildObsErrorsToolRegistration } from './obs-errors.tool';
import { buildObsHealthToolRegistration } from './obs-health.tool';
import { buildObsRuntimeMetricsToolRegistration } from './obs-runtime-metrics.tool';

interface IObservabilityRegistrationContext {
	readonly namespacePrefix: string;
	readonly workspace: {
		readonly root: string;
	};
}

export interface IBuildObservabilityToolRegistrationsOptions {
	readonly ctx: IObservabilityRegistrationContext;
	readonly source?: IErrorSource;
	readonly metricsRegistry: IRuntimeMetricsRegistry;
}

interface IObservabilityToolDescriptor {
	readonly id: string;
	readonly sourcePath: string;
	readonly buildRegistration: (
		options: IBuildObservabilityToolRegistrationsOptions,
	) => IToolRegistration;
}

export const OBSERVABILITY_TOOL_DESCRIPTORS: readonly IObservabilityToolDescriptor[] =
	[
		{
			id: 'obs_errors',
			sourcePath:
				'plugins/observability/src/lib/tools/obs-errors.tool.ts',
			buildRegistration: ({ ctx, source }) =>
				buildObsErrorsToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					...(source === undefined ? {} : { source }),
				}),
		},
		{
			id: 'obs_correlate',
			sourcePath:
				'plugins/observability/src/lib/tools/obs-correlate.tool.ts',
			buildRegistration: ({ ctx, source }) =>
				buildObsCorrelateToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					...(source === undefined
						? {}
						: {
								issueReader: async () =>
									(
										await listRecentErrors(source, {
											limit: 100,
										})
									).issues,
							}),
					localDeps: realReadLocalCorrelateDeps(ctx.workspace.root),
				}),
		},
		{
			id: 'obs_health',
			sourcePath:
				'plugins/observability/src/lib/tools/obs-health.tool.ts',
			buildRegistration: ({ ctx, metricsRegistry }) =>
				buildObsHealthToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					workspaceRootAbs: ctx.workspace.root,
					metricsRegistry,
				}),
		},
		{
			id: 'obs_runtime_metrics',
			sourcePath:
				'plugins/observability/src/lib/tools/obs-runtime-metrics.tool.ts',
			buildRegistration: ({ ctx, metricsRegistry }) =>
				buildObsRuntimeMetricsToolRegistration({
					namespacePrefix: ctx.namespacePrefix,
					registry: metricsRegistry,
				}),
		},
	] as const;

export const listObservabilityToolIds = (): readonly string[] =>
	OBSERVABILITY_TOOL_DESCRIPTORS.map((descriptor) => descriptor.id);

export const buildObservabilityToolSourcePathMap = (): Readonly<
	Record<string, string>
> =>
	Object.fromEntries(
		OBSERVABILITY_TOOL_DESCRIPTORS.map((descriptor) => [
			descriptor.id,
			descriptor.sourcePath,
		]),
	);

export const buildObservabilityToolRegistrations = (
	options: IBuildObservabilityToolRegistrationsOptions,
): readonly IToolRegistration[] =>
	OBSERVABILITY_TOOL_DESCRIPTORS.map((descriptor) =>
		descriptor.buildRegistration(options),
	);
