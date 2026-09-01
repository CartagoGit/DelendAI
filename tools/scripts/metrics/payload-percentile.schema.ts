/**
 * payload-percentile.schema.ts — the consumer-side envelope for the
 * metrics longitudinal regression gate (f00027): a producer's
 * `calls`/`activations` counter plus the shared `PayloadPercentileSchema`
 * contract from `@mcp-vertex/core` (imported, not re-derived here, so this
 * script's validation can never drift from what the plugin tools actually
 * emit).
 *
 * Root cause the shared schema replaces: a producer emitted
 * `p95PayloadBytes: null` when it had no samples, while a consumer's
 * schema demanded a finite number — two layers of the same pipeline
 * disagreeing on how "no data" is represented. Coercing `null` to `0`
 * would have told the regression gate "the payload got cheaper" when
 * nothing was ever observed, silently corrupting the comparison the gate
 * exists to protect.
 */
import z from 'zod';

import { PayloadPercentileSchema } from '@mcp-vertex/core/public';

export { PayloadPercentileSchema };
export type { IPayloadPercentile } from '@mcp-vertex/core/public';

/**
 * Shape returned by both `obs_runtime_metrics` (observability) and
 * `activation_metrics` (adaptive-optimizer): a call/activation count plus
 * the discriminated percentile. `calls` and `activations` are each
 * optional because the two tools use the vocabulary that fits their own
 * domain — a caller reads whichever key its producer emits.
 */
export const PluginMetricsSnapshotSchema = z.object({
	calls: z.number().int().nonnegative().optional(),
	activations: z.number().int().nonnegative().optional(),
	responses: PayloadPercentileSchema,
});

export type IPluginMetricsSnapshot = z.infer<
	typeof PluginMetricsSnapshotSchema
>;
