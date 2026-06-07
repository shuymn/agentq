#!/usr/bin/env bun

import { buildCodexStopDecision, buildCodexStopErrorDecision } from "../../src/adapters/codex";
import { queryCurrentState } from "../../src/adapters/hook-utils";

let state: ReturnType<typeof queryCurrentState>;
try {
  state = queryCurrentState(process.env);
} catch {
  console.log(JSON.stringify(buildCodexStopErrorDecision()));
  process.exit(0);
}

console.log(JSON.stringify(buildCodexStopDecision(state)));
