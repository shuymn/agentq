#!/usr/bin/env bun

import { buildClaudeMonitorPrompt } from "../../src/adapters/claude-code";
import { queryCurrentState } from "../../src/adapters/hook-utils";

let state: ReturnType<typeof queryCurrentState>;
try {
  state = queryCurrentState(process.env);
} catch {
  process.exit(0);
}

if (!state) {
  process.exit(0);
}

if (state.state === "assigned") {
  console.log(buildClaudeMonitorPrompt());
}
