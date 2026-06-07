import { describe, expect, test } from "bun:test";
import {
  defaultPiQueueBridgeConfig,
  resolveCurrentCommand,
} from "../extensions/pi-queue-bridge/index";

describe("Pi queue bridge", () => {
  test("resolveCurrentCommand replaces tier flag in default config", () => {
    expect(resolveCurrentCommand(defaultPiQueueBridgeConfig, "summary")).toEqual([
      "agentq",
      "current",
      "--summary",
    ]);
    expect(resolveCurrentCommand(defaultPiQueueBridgeConfig, "full")).toEqual([
      "agentq",
      "current",
      "--full",
    ]);
  });

  test("resolveCurrentCommand appends tier flag when base has none", () => {
    expect(resolveCurrentCommand({ bridgeAction: { command: "/review" } }, "full")).toEqual([
      "agentq",
      "current",
      "--full",
    ]);
  });
});
