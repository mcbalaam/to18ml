import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import {
  DEFAULT_PACKAGE_NAME,
  generate,
  type GeneratedFiles,
} from "../codegen";
import { runChecks } from "../check";
import { compileLocale } from "../compile";
import type { FlatMessages } from "../core/types";

const DEFAULTS = {
  localesDir: "locales",
  generatedDir: "locales/generated",
  packageName: DEFAULT_PACKAGE_NAME,
} as const;

/** Shape of `to18ml.config.ts`. */
export interface To18mlConfig {
  /** Directory of `<locale>.toml` files. Defaults to `"locales"`. */
  localesDir?: string;
  /** Output dir for generated code. Defaults to `"locales/generated"`. */
  generatedDir?: string;
  /** Locale appended to every fallback chain. */
  defaultLocale: string;
  /** Explicit fallback chains per locale. */
  fallback?: Record<string, string[]>;
  /** Package name in generated imports. */
  packageName?: string;
  /** Emit per-namespace modules + `loadNamespace` instead of `messages`. */
  split?: boolean;
  /** Treat empty strings as errors. */
  strictEmpty?: boolean;
}

/** Identity helper for typed configs. */
export function defineConfig(config: To18mlConfig): To18mlConfig {
  return config;
}

export interface ResolvedConfig {
  root: string;
  localesDir: string;
  generatedDir: string;
  defaultLocale: string;
  fallback: Record<string, string[]> | undefined;
  packageName: string;
  split: boolean;
  strictEmpty: boolean;
}

export function resolveConfig(config: To18mlConfig, root: string): ResolvedConfig {
  return {
    root,
    localesDir: resolve(root, config.localesDir ?? DEFAULTS.localesDir),
    generatedDir: resolve(root, config.generatedDir ?? DEFAULTS.generatedDir),
    defaultLocale: config.defaultLocale,
    fallback: config.fallback,
    packageName: config.packageName ?? DEFAULTS.packageName,
    split: config.split ?? false,
    strictEmpty: config.strictEmpty ?? false,
  };
}

export interface BuildResult {
  ok: boolean;
  locales: string[];
  errors: string[];
  warnings: string[];
  written: string[];
}

export interface BuildOptions {
  /** When false, generate in memory without writing. */
  write?: boolean;
}

/** `ru` or `ru-RU`: lowercase language, optional uppercase region. */
const LOCALE_TAG = /^[a-z]{2,3}(-[A-Z]{2})?$/;

/** `ru-RU.toml` -> `ru-RU`. */
export function localeFromFilename(filename: string): string {
  return basename(filename, extname(filename));
}

/** Generate every output file for the given locales. */
function generateFiles(
  config: ResolvedConfig,
  locales: Record<string, FlatMessages>,
): GeneratedFiles {
  return generate(locales, {
    defaultLocale: config.defaultLocale,
    packageName: config.packageName,
    split: config.split,
  });
}

/** Compile locales, run checks, and (optionally) write output. */
export async function build(
  config: ResolvedConfig,
  options: BuildOptions = {},
): Promise<BuildResult> {
  const write = options.write ?? true;
  const errors: string[] = [];
  const warnings: string[] = [];

  let entries: string[];
  try {
    const dirents = await readdir(config.localesDir, { withFileTypes: true });
    entries = dirents
      .filter((entry) => entry.isFile() && extname(entry.name) === ".toml")
      .map((entry) => entry.name)
      .sort();
  } catch (error) {
    const code = (error as { code?: string }).code;
    const detail = error instanceof Error ? error.message : String(error);
    const message =
      code === "ENOENT"
        ? `locales directory not found: ${config.localesDir}`
        : `cannot read locales directory ${config.localesDir}: ${detail}`;
    return { ok: false, locales: [], errors: [message], warnings, written: [] };
  }

  if (entries.length === 0) {
    return {
      ok: false,
      locales: [],
      errors: [`no .toml locale files found in ${config.localesDir}`],
      warnings,
      written: [],
    };
  }

  const locales: Record<string, FlatMessages> = {};
  const localeNames: string[] = [];

  for (const filename of entries) {
    const locale = localeFromFilename(filename);
    if (!LOCALE_TAG.test(locale)) {
      errors.push(
        `"${filename}": locale must be "xx" or "xx-YY" (e.g. "ru", "ru-RU")`,
      );
      continue;
    }
    if (localeNames.includes(locale)) {
      errors.push(`duplicate locale "${locale}"`);
      continue;
    }
    localeNames.push(locale);

    const source = await readFile(join(config.localesDir, filename), "utf8");
    const result = compileLocale(source, locale);
    for (const error of result.errors) errors.push(error.message);
    locales[locale] = result.messages;
  }

  if (!localeNames.includes(config.defaultLocale)) {
    errors.push(
      `defaultLocale "${config.defaultLocale}" has no matching locale file`,
    );
  }

  for (const [locale, chain] of Object.entries(config.fallback ?? {})) {
    if (!localeNames.includes(locale)) {
      warnings.push(
        `fallback for "${locale}" is unused: no matching locale file`,
      );
    }
    for (const target of chain) {
      if (!localeNames.includes(target)) {
        warnings.push(
          `fallback "${locale}" -> "${target}" has no matching locale file`,
        );
      }
    }
  }

  // Cross-locale checks need clean parses.
  if (errors.length === 0) {
    const issues = runChecks(locales, { strictEmpty: config.strictEmpty });
    for (const issue of issues) {
      if (issue.level === "error") errors.push(issue.message);
      else warnings.push(issue.message);
    }
  }

  if (errors.length > 0) {
    return { ok: false, locales: localeNames, errors, warnings, written: [] };
  }

  const written = write
    ? await writeOutput(config, locales)
    : generateOutputPaths(config, locales);

  return { ok: true, locales: localeNames, errors, warnings, written };
}

function generateOutputPaths(
  config: ResolvedConfig,
  locales: Record<string, FlatMessages>,
): string[] {
  const files = generateFiles(config, locales);
  return Object.keys(files).map((name) => join(config.generatedDir, name));
}

async function writeOutput(
  config: ResolvedConfig,
  locales: Record<string, FlatMessages>,
): Promise<string[]> {
  // Generate in memory first: a generation failure must not delete existing output.
  const files = generateFiles(config, locales);

  // Only touch dirs we own.
  await rm(join(config.generatedDir, "messages"), { recursive: true, force: true });
  await rm(join(config.generatedDir, "namespaces"), { recursive: true, force: true });

  const written: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const file = join(config.generatedDir, name);
    await mkdir(dirname(file), { recursive: true });
    // Write to a temp path and rename so readers never see a partial file.
    const tmp = `${file}.to18ml-tmp`;
    await writeFile(tmp, content, "utf8");
    await rename(tmp, file);
    written.push(file);
  }

  return written;
}
