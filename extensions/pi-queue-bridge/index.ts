export interface PiBridgeActionConfig {
  command: string;
  args?: string[];
}

export interface PiQueueBridgeConfig {
  bridgeAction: PiBridgeActionConfig;
  observe?: {
    currentCommand?: string[];
  };
  execute?: {
    doneCommand?: string[];
  };
}

export const defaultPiQueueBridgeConfig: PiQueueBridgeConfig = {
  bridgeAction: {
    command: "/review",
    args: ["--no-fix"],
  },
  observe: {
    currentCommand: ["agentq", "current", "--summary"],
  },
  execute: {
    doneCommand: ["agentq", "done"],
  },
};

export const buildPiBridgeAction = (
  config: PiQueueBridgeConfig = defaultPiQueueBridgeConfig,
): PiBridgeActionConfig => config.bridgeAction;

export const resolveCurrentCommand = (
  config: PiQueueBridgeConfig = defaultPiQueueBridgeConfig,
  tier: "summary" | "full" = "summary",
): string[] => {
  const base = config.observe?.currentCommand ?? ["agentq", "current"];
  const tierFlag = tier === "summary" ? "--summary" : "--full";
  const withoutTier = base.filter((arg) => arg !== "--summary" && arg !== "--full");
  return [...withoutTier, tierFlag];
};
