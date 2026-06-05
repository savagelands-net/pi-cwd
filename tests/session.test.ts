import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { forkSessionToCwd } from "../src/session.ts";

describe("session cwd switching", () => {
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
