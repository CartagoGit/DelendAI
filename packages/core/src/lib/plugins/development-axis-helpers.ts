/**
 * development-axis-helpers.ts — the two shapes every policy axis is
 * written in.
 *
 * A `strategy` axis is a free string on purpose: Zod would reject a
 * typo with "invalid enum value", which says nothing about what the
 * operator meant; passing the unknown vocabulary through to
 * `validateDevelopmentPolicy` produces a diagnostic that names the
 * rule, the config path and a concrete remedy.
 *
 * Both helpers take the axis's own description, so the prose travels
 * with the shape and the two halves of the policy cannot drift apart.
 */
import { z } from 'zod';

export const strategy = (description: string) =>
	z.string().min(1).describe(description).optional();
export const wholeNumber = (description: string) =>
	z.number().int().nonnegative().describe(description).optional();
