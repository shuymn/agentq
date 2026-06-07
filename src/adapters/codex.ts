import { AGENTQ_TOKEN_ENV } from "../constants";
import type { AgentCurrentState } from "./hook-utils";

export const buildCodexSessionStartContext = (env: Record<string, string | undefined>) => {
  if (!env[AGENTQ_TOKEN_ENV]) {
    return null;
  }
  return [
    "Agent Queue token detected.",
    "See docs/adapter-contract.md for the JSON contract.",
    "Run `agentq current --summary` to inspect assignment state.",
    "Use `agentq current --full` when you need complete Baton or Artifact metadata.",
    "After completing assigned work, run `agentq done --body <text> [--artifact <path>]`.",
  ].join("\n");
};

export const buildCodexStopDecision = (
  current: AgentCurrentState | null,
): { decision: "allow" } | { decision: "block"; reason: string } => {
  if (current === null) {
    return { decision: "allow" };
  }
  if (current.state === "assigned") {
    return {
      decision: "block",
      reason: "Agent Queue assignment is still active; inspect it with `agentq current --summary`.",
    };
  }
  return { decision: "allow" };
};

export const buildCodexStopErrorDecision = (): { decision: "allow" } => ({
  decision: "allow",
});
