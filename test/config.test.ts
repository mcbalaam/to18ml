import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { loadConfig } from "../src/cli/config";

const BASE = "/tmp/opencode";
const CONFIG = `export default { defaultLocale: "ru-RU" };\n`;

let root: string;

beforeEach(async () => {
  await mkdir(BASE, { recursive: true });
  root = await mkdtemp(join(BASE, "to18ml-cfg-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("loadConfig search", () => {
  test("finds a config in the project root", async () => {
    const project = join(root, "project");
    await mkdir(join(project, "src"), { recursive: true });
    await writeFile(join(project, "package.json"), "{}");
    await writeFile(join(project, "to18ml.config.ts"), CONFIG);
    const loaded = await loadConfig(join(project, "src"));
    expect(loaded.root).toBe(project);
  });

  test("does not climb past the project root into a parent config", async () => {
    await writeFile(join(root, "to18ml.config.ts"), CONFIG);
    const project = join(root, "project");
    await mkdir(project, { recursive: true });
    await writeFile(join(project, "package.json"), "{}");
    await expect(loadConfig(project)).rejects.toThrow("no config file found");
  });
});
