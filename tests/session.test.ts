import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
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
  it("changes cwd when the current session has not been flushed to disk yet", async () => {
    const sourceCwd = mkdtempSync(join(tmpdir(), "pi-cwd-source-"));
    const targetCwd = mkdtempSync(join(tmpdir(), "pi-cwd-target-"));
    const sessionDir = mkdtempSync(join(tmpdir(), "pi-cwd-sessions-"));
    const sourceSession = SessionManager.create(realpathSync(sourceCwd), sessionDir);
    const sourceFile = sourceSession.getSessionFile();
    expect(sourceFile).toBeDefined();

    type CommandRegistration = Omit<RegisteredCommand, "name" | "sourceInfo">;
    type SwitchSessionOptions = {
      withSession?: (ctx: { cwd: string; ui: { notify: (message: string) => void } }) => Promise<void> | void;
    };

    const commands = new Map<string, CommandRegistration>();
    cwdExtension({
      registerCommand: (name: string, command: CommandRegistration): void => {
        commands.set(name, command);
      },
      on: () => undefined,
    } as unknown as ExtensionAPI);

    let switchedTo: string | undefined;
    const notifications: string[] = [];
    const ctx = {
      cwd: realpathSync(sourceCwd),
      sessionManager: sourceSession,
      ui: { notify: (message: string) => notifications.push(message) },
      waitForIdle: async () => undefined,
      switchSession: async (sessionFile: string, options: SwitchSessionOptions) => {
        switchedTo = sessionFile;
        await options.withSession?.({
          cwd: realpathSync(targetCwd),
          ui: { notify: (message: string) => notifications.push(message) },
        });
        return { cancelled: false };
      },
    };

    await commands.get("cd")?.handler(targetCwd, ctx as unknown as ExtensionCommandContext);

    expect(switchedTo).toBeDefined();
    const lines = readFileSync(switchedTo!, "utf8").trim().split("\n");
    const header = JSON.parse(lines[0]);

    expect(header.cwd).toBe(realpathSync(targetCwd));
    expect(header.parentSession).toBe(sourceFile);
    expect(lines).toHaveLength(1);
    expect(notifications).toContain(`cwd: ${realpathSync(targetCwd)}`);
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
          message: { role: "user", content: [{ type: "text", text: "hello" }], timestamp: Date.now() },
        }),
      ].join("\n") + "\n",
    );

    const forkedFile = forkSessionToCwd(sourceFile, realpathSync(targetCwd), sessionDir);
    const lines = readFileSync(forkedFile, "utf8").trim().split("\n");
    const header = JSON.parse(lines[0]);

    expect(header.cwd).toBe(realpathSync(targetCwd));
    expect(header.parentSession).toBe(sourceFile);
    expect(lines.some((line) => line.includes("hello"))).toBe(true);
  });
});
