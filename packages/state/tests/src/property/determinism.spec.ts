/**
 * determinism.spec.ts — the in-memory driver keeps the determinism property.
 */
import { defineInMemoryStateRegistry } from '../../../src/lib/driver-in-memory';
import { determinismProperty } from '../contract/determinism-property.helper';

determinismProperty('in-memory', defineInMemoryStateRegistry);
