/**
 * corruption.spec.ts — the in-memory driver keeps the corruption property.
 */
import { defineInMemoryStateRegistry } from '../../../src/lib/driver-in-memory';
import { corruptionProperty } from '../contract/corruption-property.helper';

corruptionProperty('in-memory', defineInMemoryStateRegistry);
