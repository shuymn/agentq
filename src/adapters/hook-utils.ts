import { AGENTQ_BIN_ENV, AGENTQ_TOKEN_ENV } from "../constants";

export type AgentCurrentState = { state: "waiting" | "assigned" };

/**
 * Shared helper for hooks: checks token, runs `agentq current`, parses result.
 * Returns null if no token is set (hook should exit silently).
 * Throws if `agentq current` fails.
 */
export const queryCurrentState = (
  env: Record<string, string | undefined>,
): AgentCurrentState | null => {
  const token = env[AGENTQ_TOKEN_ENV];
  if (!token) {
    return null;
  }
  const current = Bun.spawnSync({
    cmd: [env[AGENTQ_BIN_ENV] ?? "agentq", "current", "--summary"],
    env,
    stderr: "pipe",
    stdout: "pipe",
  });
  if (current.exitCode !== 0) {
    throw new Error(
      `agentq current failed (exit ${current.exitCode}): ${current.stderr.toString()}`,
    );
  }
  const parsed: unknown = JSON.parse(current.stdout.toString());
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("state" in parsed) ||
    (parsed.state !== "waiting" && parsed.state !== "assigned")
  ) {
    throw new Error(`agentq current returned unexpected shape: ${current.stdout.toString()}`);
  }
  return parsed as AgentCurrentState;
};
