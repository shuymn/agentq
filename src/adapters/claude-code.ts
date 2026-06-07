export const buildClaudeMonitorPrompt = () =>
  [
    "Agent Queue assignment available.",
    "Use `agentq current --summary` to decide whether to act.",
    "Use `agentq current --full` when you need complete Baton or Artifact metadata.",
    "Submit results with `agentq done --body <text> [--artifact <path>]`.",
    "See docs/adapter-contract.md for the JSON contract.",
  ].join("\n");
