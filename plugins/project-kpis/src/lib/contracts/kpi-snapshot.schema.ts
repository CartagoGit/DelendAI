import z from 'zod';

import { KPI_METRIC_UNITS, KPI_VALUE_STATUSES } from './kpi-snapshot.interface';

export const KpiMetricSchema = z
	.object({
		status: z.enum(KPI_VALUE_STATUSES),
		unit: z.enum(KPI_METRIC_UNITS),
		source: z.string(),
		value: z.number().finite().optional(),
		observedAt: z.string().optional(),
		note: z.string().optional(),
	})
	.strict();

export const KpiNextActionSchema = z
	.object({
		tool: z.string(),
		reason: z.string(),
	})
	.strict();

export const KpiTopPluginSchema = z
	.object({
		plugin: z.string(),
		calls: z.number().int().min(0),
		errors: z.number().int().min(0),
		totalTokens: z.number().int().min(0),
		costUsd: z.number().min(0),
	})
	.strict();

export const KpiHealthSectionSchema = z
	.object({
		status: z.enum(KPI_VALUE_STATUSES),
		source: z.string(),
		score: KpiMetricSchema,
		security: KpiMetricSchema,
		deps: KpiMetricSchema,
		quality: KpiMetricSchema,
		debt: KpiMetricSchema,
		next: z.array(KpiNextActionSchema),
		note: z.string().optional(),
	})
	.strict();

export const KpiUsageSectionSchema = z
	.object({
		status: z.enum(KPI_VALUE_STATUSES),
		source: z.string(),
		calls: KpiMetricSchema,
		errors: KpiMetricSchema,
		toolErrorRate: KpiMetricSchema,
		totalTokens: KpiMetricSchema,
		costUsd: KpiMetricSchema,
		tokensSaved: KpiMetricSchema,
		memoryCompactionSavingsTokens: KpiMetricSchema,
		topPlugins: z.array(KpiTopPluginSchema),
		note: z.string().optional(),
	})
	.strict();

export const KpiDeliverySectionSchema = z
	.object({
		status: z.enum(KPI_VALUE_STATUSES),
		source: z.string(),
		note: z.string(),
	})
	.strict();

export const KpiSnapshotSchema = z
	.object({
		contract: z.literal('project-kpis.snapshot'),
		version: z.literal(1),
		generatedAt: z.string(),
		windowDays: z.number().int().positive(),
		health: KpiHealthSectionSchema,
		usage: KpiUsageSectionSchema,
		delivery: KpiDeliverySectionSchema,
		bytes: z.number().int().positive(),
		truncated: z.boolean(),
		originalBytes: z.number().int().positive().optional(),
	})
	.strict();

export type IKpiSnapshotSchema = z.infer<typeof KpiSnapshotSchema>;

export const KpiSnapshotOutputSchema = KpiSnapshotSchema;
