import { describe, expect, test } from "bun:test";
import { buildCodexStopDecision, buildCodexStopErrorDecision } from "../src/adapters/codex";

describe("Codex stop adapter", () => {
  test("buildCodexStopDecision allows when state is null", () => {
    expect(buildCodexStopDecision(null)).toEqual({ decision: "allow" });
  });

  test("buildCodexStopDecision allows when waiting", () => {
    expect(buildCodexStopDecision({ state: "waiting" })).toEqual({ decision: "allow" });
  });

  test("buildCodexStopDecision blocks when assigned", () => {
    expect(buildCodexStopDecision({ state: "assigned" })).toEqual({
      decision: "block",
      reason: "Agent Queue assignment is still active; inspect it with `agentq current --summary`.",
    });
  });

  test("buildCodexStopErrorDecision allows when agentq current fails", () => {
    expect(buildCodexStopErrorDecision()).toEqual({ decision: "allow" });
  });
});
