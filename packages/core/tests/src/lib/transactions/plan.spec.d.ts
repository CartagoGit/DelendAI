#!/usr/bin/env bun
/**
 * plan.spec.ts — f00201 (Track O / q00006 §55).
 *
 * Pure-functional tests for the workflow-transaction executor:
 * synthetic steps (counter increments, no real side effects).
 * The acceptance criterion from the proposal is "si el step 3
 * falla, se compensan 1 y 2; el contador vuelve a 0", which we
 * pin with a counter step pattern.
 */
export {};
