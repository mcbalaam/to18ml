import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, parse, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { To18mlConfig } from "../build";

const CANDIDATES = [
  "to18ml.config.ts",
  "to18ml.config.mts",
  "to18ml.config.js",
  "to18ml.config.mjs",
];

export interface LoadedConfig {
  config: To18mlConfig;
  /** Config dir; all config paths are resolved relative to it. */
  root: string;
  file: string;
}

/**
 * Walk up from `cwd` looking for a config file. The search stops at the project
 * root (a dir with `.git` or `package.json`) and never goes above the home dir.
 */
function findConfigUp(cwd: string): string | undefined {
  const { root } = parse(resolve(cwd));
  const home = resolve(homedir());
  let dir = resolve(cwd);
  for (;;) {
    for (const name of CANDIDATES) {
      const file = join(dir, name);
      if (existsSync(file)) return file;
    }
    const isProjectRoot =
      existsSync(join(dir, ".git")) || existsSync(join(dir, "package.json"));
    if (isProjectRoot || dir === home || dir === root) return undefined;
    dir = dirname(dir);
  }
}

/** Import the master `to18ml.config.*` (Bun loads `.ts` directly). */
export async function loadConfig(cwd: string = process.cwd()): Promise<LoadedConfig> {
  const file = findConfigUp(cwd);
  if (file === undefined) {
    throw new Error(
      `no config file found from ${cwd} upward; expected one of: ${CANDIDATES.join(", ")}`,
    );
  }

  const module = (await import(pathToFileURL(file).href)) as {
    default?: To18mlConfig;
  };
  const config = module.default;
  if (config === undefined || config === null || typeof config !== "object") {
    throw new Error(`config must default-export an object: ${file}`);
  }

  return { config, root: dirname(file), file };
}
