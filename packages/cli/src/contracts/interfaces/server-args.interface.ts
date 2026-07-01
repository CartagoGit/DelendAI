/**
 * server-args.interface.ts — f00037 contract surface for
 * `lib/server-args.service.ts`.
 *
 * The declarative `IAutoForwardRule` table is the single source of
 * truth for which `ICliGlobalOptions` fields forward to which host
 * flags (a00036 F-001). The rule discriminator (`IAutoForwardKind`)
 * and the row shape live here so external hosts can register custom
 * passthrough rules without depending on the service module's
 * implementation helpers.
 */

import type { ICliGlobalOptions } from './cli-command.interface';

/** Discriminator for the shape of a forwarding rule. */
export type IAutoForwardKind = 'flag' | 'option' | 'repeatable' | 'passthrough';

export interface IAutoForwardRule {
	/** Field name on `ICliGlobalOptions`. */
	readonly key: keyof ICliGlobalOptions;
	/** Shape of the rule (drives how the value renders to argv). */
	readonly kind: IAutoForwardKind;
	/**
	 * Compute the argv fragment for this field.
	 * @param key   the `keyof ICliGlobalOptions` rendered as `--${key}`
	 * @param value the field value, narrowed by the renderer below
	 */
	readonly argv: (key: string, value: unknown) => readonly string[];
}