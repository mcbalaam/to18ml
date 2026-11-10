#!/usr/bin/env bun
import { build, resolveConfig } from "../build";
import { loadConfig } from "./config";
import { watchLocales } from "./watch";

const HELP = `to18ml — generate typed messages from TOML locales.

Usage:
  to18ml [gen] [--check] [--watch]

Options:
  --check       validate only, write nothing
  --watch       regenerate when locale files change
  -h, --help    show this help
`;

interface ParsedArgs {
  check: boolean;
  watch: boolean;
  help: boolean;
  unknown: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { check: false, watch: false, help: false, unknown: [] };
  for (const arg of argv) {
    if (arg === "--check" || arg === "check") args.check = true;
    else if (arg === "--watch") args.watch = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "gen") continue;
    else args.unknown.push(arg);
  }
  return args;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  if (args.unknown.length > 0) {
    console.error(`unknown argument(s): ${args.unknown.join(", ")}\n`);
    console.error(HELP);
    return 2;
  }

  const { config, root, file } = await loadConfig(process.cwd());
  const resolved = resolveConfig(config, root);
  const run = async () => {
    const result = await build(resolved, { write: !args.check });
    for (const warning of result.warnings) console.error(`warning: ${warning}`);
    for (const error of result.errors) console.error(`error: ${error}`);
    if (!result.ok) {
      console.error(`\nto18ml failed with ${result.errors.length} error(s).`);
      return;
    }
    const mode = args.check ? "check" : "gen";
    console.log(
      `to18ml ${mode}: ${result.locales.length} locale(s) [${result.locales.join(", ")}] ok` +
        (args.check ? "" : `, ${result.written.length} file(s) written`),
    );
    if (!args.check) {
      console.log(`  config: ${file}`);
      console.log(`  output: ${resolved.generatedDir}`);
    }
  };
  await run();
  if (args.watch) {
    console.log(`to18ml: watching ${resolved.localesDir}`);
    await watchLocales(resolved.localesDir, run);
  }
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
