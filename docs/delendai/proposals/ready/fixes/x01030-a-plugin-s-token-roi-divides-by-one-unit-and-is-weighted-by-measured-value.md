---
id: x01030
title: "A plugin's token ROI divides by one unit and is weighted by measured value"
kind: fix
status: ready
type: proposal
track: general
date: 2026-11-04
---

# x01030 — A plugin's token ROI divides by one unit and is weighted by measured value

## goal

The token ROI report divides a plugin's value by a single unit (tokens, from the schema bytes converted with the stated estimate or both sides in bytes), and states that the value weight is declared by the plugin and not measured from task outcomes.

## why

External review in a ChatGPT conversation about develop (reviewer active 2026-10-20 to 2026-10-29). Remark of 2026-10-23, after f00776 connected real measurements: the formula still mixes schema bytes with response tokens, which are different units, so the score is not a coherent physical measure of efficiency; and it multiplies by a value that the plugin declares in its own manifest, which is a weight and not proof of usefulness for the user. The reviewer raised the feature from 4.5 to 7.5 out of 10 and kept these two limits. Verified in the code on develop (3188f9414, 2026-11-04): tools/scripts/report/token-roi.script.ts line 244 still prints tokenROI = (successful_calls x value) / (schema_bytes + response_tokens). x00977 (review) fixes baselines of savings but does not mention this formula; q00039 will measure tokens per accepted unit, which is the outcome-based value this report lacks. Product principles (AGENT-BOOTSTRAP section 0): cheap in tokens (count tokens, with a stated baseline) and bounded (an estimate says it is one).

## non-goals

- Replacing the report by the per-accepted-unit KPI of q00039.

## slices

- global_gate: type

### S1 — One unit in the denominator and a labelled weight
- **Status**: pending
- **Files**: `tools/scripts/report/token-roi.script.ts`, `tools/scripts/report/token-roi.script.spec.ts`
- **Gate**: type
- acceptance:
  - "The denominator adds quantities of one unit; the conversion from bytes to tokens, when used, is named as an estimate in the report."
  - "The report labels value as declared by the plugin, not measured."
  - "A spec pins a plugin whose schema bytes and response tokens differ by orders of magnitude."

## acceptance

- The denominator adds quantities of one unit; the conversion from bytes to tokens, when used, is named as an estimate in the report.
- The report labels value as declared by the plugin, not measured.
- A spec pins a plugin whose schema bytes and response tokens differ by orders of magnitude.
