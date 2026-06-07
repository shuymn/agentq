#!/usr/bin/env bun

import { buildCodexSessionStartContext } from "../../src/adapters/codex";

const context = buildCodexSessionStartContext(process.env);
if (context) {
  console.log(JSON.stringify({ additionalContext: context }));
}
