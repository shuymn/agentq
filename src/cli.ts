#!/usr/bin/env bun

import {
  AGENTQ_INSTANCE_ID_ENV,
  AGENTQ_ROLE_ENV,
  AGENTQ_ROOM_ID_ENV,
  AGENTQ_TOKEN_ENV,
  getDataDir,
} from "./constants";
import { AgentQError } from "./errors";
import { AgentQueueStore } from "./store";
import { type OutputTier, viewCurrent, viewStatus } from "./view";

interface CliContext {
  argv: string[];
  cwd: string;
  env: Record<string, string | undefined>;
  stdout: Pick<typeof console, "log">;
  stderr: Pick<typeof console, "error">;
}

export const runCli = async ({ argv, cwd, env, stdout, stderr }: CliContext): Promise<number> => {
  let store: AgentQueueStore | undefined;
  try {
    store = new AgentQueueStore({ dataDir: getDataDir(env) });
    const command = argv[0];
    switch (command) {
      case "join": {
        const { role } = parseRoleOnly(argv.slice(1));
        stdout.log(toJson({ origin: store.registerOrigin({ cwd, role }) }));
        return 0;
      }
      case "listen": {
        const parsed = parseListen(argv.slice(1));
        const waiter = store.registerWaiter({
          cwd,
          role: parsed.role,
          afterRole: parsed.afterRole,
          launchCommand: parsed.command,
        });
        try {
          const exitCode = await runAgentCommand(parsed.command, cwd, {
            ...env,
            [AGENTQ_TOKEN_ENV]: waiter.token,
            [AGENTQ_INSTANCE_ID_ENV]: waiter.instanceId,
            [AGENTQ_ROOM_ID_ENV]: waiter.roomId,
            [AGENTQ_ROLE_ENV]: waiter.role,
          });
          return exitCode;
        } finally {
          store.leaveWaiter(waiter.instanceId);
        }
      }
      case "handoff": {
        const parsed = parseBodyArtifact(argv.slice(1));
        stdout.log(
          toJson(
            store.createHandoff({
              cwd,
              body: parsed.body,
              artifactPath: parsed.artifactPath,
            }),
          ),
        );
        return 0;
      }
      case "current": {
        const tier = parseOutputTier(argv.slice(1));
        stdout.log(toJson(viewCurrent(store.getCurrentByToken(requireToken(env)), tier)));
        return 0;
      }
      case "done": {
        const parsed = parseBodyArtifact(argv.slice(1));
        stdout.log(
          toJson(
            store.submitDoneReport({
              token: requireToken(env),
              body: parsed.body,
              artifactPath: parsed.artifactPath,
            }),
          ),
        );
        return 0;
      }
      case "status": {
        const tier = parseOutputTier(argv.slice(1));
        stdout.log(toJson(viewStatus(store.getStatus({ cwd }), tier)));
        return 0;
      }
      case "dismiss": {
        stdout.log(toJson(store.dismissRoom({ cwd })));
        return 0;
      }
      default:
        throw new Error(`Unknown command: ${command ?? "(missing)"}`);
    }
  } catch (error) {
    if (error instanceof AgentQError) {
      stderr.error(JSON.stringify({ code: error.code, message: error.message }));
    } else {
      stderr.error(error instanceof Error ? error.message : String(error));
    }
    return 1;
  } finally {
    store?.close();
  }
};

const parseOutputTier = (args: string[]): OutputTier => {
  let summary = false;
  let full = false;
  for (const arg of args) {
    if (arg === "--summary") {
      summary = true;
      continue;
    }
    if (arg === "--full") {
      full = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  if (summary && full) {
    throw new Error("Cannot combine --summary and --full");
  }
  if (full) {
    return "full";
  }
  return "summary";
};

const consumeFlags = (args: string[], handlers: Record<string, (value: string) => void>) => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string;
    const handler = handlers[arg];
    if (!handler) {
      throw new Error(`Unknown option: ${arg}`);
    }
    handler(requireValue(args, i, arg));
    i += 1;
  }
};

const parseRoleOnly = (args: string[]) => {
  let role: string | null = null;
  consumeFlags(args, {
    "--as": (value) => {
      role = value;
    },
  });
  if (!role) {
    throw new Error("Command requires --as <role>");
  }
  return { role };
};

const parseListen = (args: string[]) => {
  const separatorIndex = args.indexOf("--");
  if (separatorIndex === -1 || separatorIndex === args.length - 1) {
    throw new Error("agentq listen requires -- <agent command> [...args]");
  }
  const options = args.slice(0, separatorIndex);
  const command = args.slice(separatorIndex + 1);
  let role: string | null = null;
  let afterRole: string | null = null;
  consumeFlags(options, {
    "--as": (value) => {
      role = value;
    },
    "--after": (value) => {
      afterRole = value;
    },
  });
  if (!role) {
    throw new Error("agentq listen requires --as <role>");
  }
  return { role, afterRole, command };
};

const parseBodyArtifact = (args: string[]) => {
  let body = "";
  let artifactPath: string | undefined;
  consumeFlags(args, {
    "--body": (value) => {
      body = value;
    },
    "--artifact": (value) => {
      artifactPath = value;
    },
  });
  return { body, artifactPath };
};

const requireValue = (args: string[], index: number, option: string) => {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${option} requires a value`);
  }
  return value;
};

const requireToken = (env: Record<string, string | undefined>) => {
  const token = env[AGENTQ_TOKEN_ENV];
  if (!token) {
    throw new Error(`${AGENTQ_TOKEN_ENV} is required`);
  }
  return token;
};

const runAgentCommand = async (
  command: string[],
  cwd: string,
  env: Record<string, string | undefined>,
) => {
  const subprocess = Bun.spawn(command, {
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  return await subprocess.exited;
};

const toJson = (value: unknown) => JSON.stringify(value, null, 2);

if (import.meta.main) {
  const exitCode = await runCli({
    argv: process.argv.slice(2),
    cwd: process.cwd(),
    env: process.env,
    stdout: console,
    stderr: console,
  });
  process.exit(exitCode);
}
