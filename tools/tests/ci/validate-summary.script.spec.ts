import { describe, expect, it } from "vitest";

import { summarizeValidateChecks } from "../../scripts/ci/validate-summary.script";

describe("summarizeValidateChecks", () => {
  it("passes only when every declared check succeeds", () => {
    expect(
      summarizeValidateChecks({
        tests: { result: "success" },
        typecheck: { result: "success" },
      }),
    ).toEqual({
      ok: true,
      total: 2,
      passed: 2,
      failed: [],
    });
  });

  it("fails closed for skipped, cancelled, failed, and missing results", () => {
    expect(
      summarizeValidateChecks({
        cancelled: { result: "cancelled" },
        failed: { result: "failure" },
        missing: {},
        skipped: { result: "skipped" },
      }),
    ).toEqual({
      ok: false,
      total: 4,
      passed: 0,
      failed: [
        "cancelled=cancelled",
        "failed=failure",
        "missing=missing",
        "skipped=skipped",
      ],
    });
  });

  it("fails closed when no checks are provided", () => {
    expect(summarizeValidateChecks({})).toEqual({
      ok: false,
      total: 0,
      passed: 0,
      failed: [],
    });
  });
});
