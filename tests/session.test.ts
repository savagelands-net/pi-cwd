import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  SessionManager,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type RegisteredCommand,
} from "@earendil-works/pi-coding-agent";

import cwdExtension from "../src/index.ts";
import { forkSessionToCwd } from "../src/session.ts";

describe("session cwd switching", () => {
  type CommandRegistration = Omit<RegisteredCommand, "name" | "sourceInfo">;
  type ReplacementUi = {
    notify: (message: string) => void;
    custom: <T>(
      factory: (
        tui: { requestRender: (force?: boolean) => void },
        theme: unknown,
        keybindings: unknown,
        done: (result: T) => void,
      ) => { render: () => string[]; invalidate: () => void },
    ) => Promise<T>;
  };
  type ReplacementCtx = {
    cwd: string;
    mode?: "tui" | "rpc" | "json" | "print";
    ui: ReplacementUi;
  };
  type SwitchSessionOptions = {
    withSession?: (ctx: ReplacementCtx) => Promise<void> | void;
  };

  function registerCommands(): Map<string, CommandRegistration> {
    const commands = new Map<string, CommandRegistration>();
    cwdExtension({
      registerCommand: (name: string, command: CommandRegistration): void => {
        commands.set(name, command);
      },
      on: () => undefined,
    } as unknown as ExtensionAPI);
    return commands;
  }

  it("changes cwd when the current session has not been flushed to disk yet", async () => {
    const sourceCwd = mkdtempSync(join(tmpdir(), "pi-cwd-source-"));
    const targetCwd = mkdtempSync(join(tmpdir(), "pi-cwd-target-"));
    const sessionDir = mkdtempSync(join(tmpdir(), "pi-cwd-sessions-"));
    const sourceSession = SessionManager.create(
      realpathSync(sourceCwd),
      sessionDir,
    );
    const sourceFile = sourceSession.getSessionFile();
    expect(sourceFile).toBeDefined();

    const commands = registerCommands();

    let switchedTo: string | undefined;
    const notifications: string[] = [];
    const ctx = {
      cwd: realpathSync(sourceCwd),
      sessionManager: sourceSession,
      ui: { notify: (message: string) => notifications.push(message) },
      waitForIdle: async () => undefined,
      switchSession: async (
        sessionFile: string,
        options: SwitchSessionOptions,
      ) => {
        switchedTo = sessionFile;
        await options.withSession?.({
          cwd: realpathSync(targetCwd),
          ui: {
            notify: (message: string) => notifications.push(message),
            custom: async <T>(): Promise<T> => undefined as T,
          },
        });
        return { cancelled: false };
      },
    };

    await commands
      .get("cd")
      ?.handler(targetCwd, ctx as unknown as ExtensionCommandContext);

    expect(switchedTo).toBeDefined();
    const lines = readFileSync(switchedTo!, "utf8").trim().split("\n");
    const header = JSON.parse(lines[0]);

    expect(header.cwd).toBe(realpathSync(targetCwd));
    expect(header.parentSession).toBe(sourceFile);
    expect(lines).toHaveLength(1);
    expect(notifications).toContain(`cwd: ${realpathSync(targetCwd)}`);
  });

  it("forces a full terminal refresh after switching cwd", async () => {
    const sourceCwd = mkdtempSync(join(tmpdir(), "pi-cwd-source-"));
    const targetCwd = mkdtempSync(join(tmpdir(), "pi-cwd-target-"));
    const sessionDir = mkdtempSync(join(tmpdir(), "pi-cwd-sessions-"));
    const sourceSession = SessionManager.create(
      realpathSync(sourceCwd),
      sessionDir,
    );
    const commands = registerCommands();
    const forceRenderCalls: Array<boolean | undefined> = [];

    const replacementUi: ReplacementUi = {
      notify: () => undefined,
      custom: async <T>(
        factory: (
          tui: { requestRender: (force?: boolean) => void },
          theme: unknown,
          keybindings: unknown,
          done: (result: T) => void,
        ) => { render: () => string[]; invalidate: () => void },
      ): Promise<T> => {
        let resolved = undefined as T;
        const component = factory(
          { requestRender: (force?: boolean) => forceRenderCalls.push(force) },
          {},
          {},
          (result: T) => {
            resolved = result;
          },
        );
        expect(component.render()).toEqual([]);
        return resolved;
      },
    };

    const ctx = {
      cwd: realpathSync(sourceCwd),
      sessionManager: sourceSession,
      ui: { notify: () => undefined },
      waitForIdle: async () => undefined,
      switchSession: async (
        _sessionFile: string,
        options: SwitchSessionOptions,
      ) => {
        await options.withSession?.({
          cwd: realpathSync(targetCwd),
          mode: "tui",
          ui: replacementUi,
        });
        return { cancelled: false };
      },
    };

    await commands
      .get("cd")
      ?.handler(targetCwd, ctx as unknown as ExtensionCommandContext);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(forceRenderCalls).toEqual([true]);
  });

  it("forks the current session into a new session with the target cwd", () => {
    const sourceCwd = mkdtempSync(join(tmpdir(), "pi-cwd-source-"));
    const targetCwd = mkdtempSync(join(tmpdir(), "pi-cwd-target-"));
    const sessionDir = mkdtempSync(join(tmpdir(), "pi-cwd-sessions-"));
    const sourceFile = join(sessionDir, "source.jsonl");
    writeFileSync(
      sourceFile,
      [
        JSON.stringify({
          type: "session",
          version: 3,
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          cwd: realpathSync(sourceCwd),
        }),
        JSON.stringify({
          type: "message",
          id: "00000000-0000-4000-8000-000000000001",
          parentId: null,
          timestamp: new Date().toISOString(),
          message: {
            role: "user",
            content: [{ type: "text", text: "hello" }],
            timestamp: Date.now(),
          },
        }),
      ].join("\n") + "\n",
    );

    const forkedFile = forkSessionToCwd(
      sourceFile,
      realpathSync(targetCwd),
      sessionDir,
    );
    const lines = readFileSync(forkedFile, "utf8").trim().split("\n");
    const header = JSON.parse(lines[0]);

    expect(header.cwd).toBe(realpathSync(targetCwd));
    expect(header.parentSession).toBe(sourceFile);
    expect(lines.some((line) => line.includes("hello"))).toBe(true);
  });
});
