/**
 * manual-trigger.ts — the only trigger that's always available
 * regardless of cadence.triggers.
 */

import type { ITriggerEvent } from './trigger-types';

export const manualTrigger = (): ITriggerEvent => ({ kind: 'manual' });
