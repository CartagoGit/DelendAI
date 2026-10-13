/**
 * capability-registry.constant.ts — the capabilities, and the effects
 * each carries, in core's effect vocabulary.
 */
import type { ICapability } from '../interfaces/capability.interface';

export const CAPABILITIES: readonly ICapability[] = [
	{
		name: 'design.read',
		effects: ['network'],
		shapesCode: true,
		summary: 'read a design: frames, components, their properties',
	},
	{
		name: 'design.tokens',
		effects: ['network'],
		shapesCode: true,
		summary: "read a design system's tokens: colours, spacing, type",
	},
	{
		name: 'browser.inspect',
		effects: ['network', 'spawn'],
		shapesCode: true,
		summary: "inspect a page's markup and computed styles",
	},
	{
		name: 'browser.screenshot',
		effects: ['network', 'spawn', 'write'],
		shapesCode: false,
		summary: 'capture a page as an image',
	},
	{
		name: 'database.query',
		effects: ['network'],
		shapesCode: false,
		summary: 'read rows or the schema of a database',
	},
	{
		name: 'database.write',
		effects: ['network', 'write', 'destructive'],
		shapesCode: false,
		summary: 'change rows or the schema of a database',
	},
];
