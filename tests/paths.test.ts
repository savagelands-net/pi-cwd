import { mkdirSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  directoryCompletionItems,
  expandHome,
  resolveTargetDirectory,
} from "../src/paths.ts";

describe("path resolution", () => {
  it("expands ~ to the user's home directory", () => {
    expect(expandHome("~/repos", "/Users/iain")).toBe("/Users/iain/repos");
  });

  it("resolves relative paths against the current cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-cwd-paths-"));
    mkdirSync(join(root, "child"));

    expect(resolveTargetDirectory("child", root, "/unused")).toBe(realpathSync(join(root, "child")));
  });

  it("rejects paths that are not directories", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-cwd-paths-"));

    expect(() => resolveTargetDirectory("missing", root, "/unused")).toThrow(/not a directory/i);
  });
});

describe("directory completions", () => {
  it("suggests matching directories for a relative path prefix", () => {
    const root = mkdtempSync(join(tmpdir(), "pi-cwd-complete-"));
    mkdirSync(join(root, "alpha"));
    mkdirSync(join(root, "alpine"));
    mkdirSync(join(root, "beta"));

    expect(directoryCompletionItems("al", root, "/unused").map((item) => item.value)).toEqual([
      "alpha/",
      "alpine/",
    ]);
  });

  it("preserves ~/ style in completion values", () => {
    const home = mkdtempSync(join(tmpdir(), "pi-cwd-home-"));
    mkdirSync(join(home, "repos"));

    expect(directoryCompletionItems("~/re", "/unused", home).map((item) => item.value)).toEqual([
      "~/repos/",
    ]);
  });
});
