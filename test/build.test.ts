import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  build,
  defineConfig,
  localeFromFilename,
  resolveConfig,
} from "../src/build";

const BASE = "/tmp/opencode";

const RU = `[master]
welcome = "Добро пожаловать!"

[comments]
sent = "Комментарий отправлен"
`;

const EN = `[master]
welcome = "Welcome!"

[comments]
sent = "Comment sent"
`;

let root: string;

beforeEach(async () => {
  await mkdir(BASE, { recursive: true });
  root = await mkdtemp(join(BASE, "to18ml-"));
  await mkdir(join(root, "locales"), { recursive: true });
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("localeFromFilename", () => {
  test("strips the extension and keeps the tag", () => {
    expect(localeFromFilename("ru-RU.toml")).toBe("ru-RU");
    expect(localeFromFilename("/a/b/en.toml")).toBe("en");
  });
});

describe("resolveConfig", () => {
  test("applies defaults and resolves paths against the root", () => {
    const config = resolveConfig({ defaultLocale: "ru-RU" }, "/proj");
    expect(config).toEqual({
      root: "/proj",
      localesDir: "/proj/locales",
      generatedDir: "/proj/locales/generated",
      defaultLocale: "ru-RU",
      fallback: undefined,
      packageName: "to18ml",
      split: false,
      strictEmpty: false,
    });
  });

  test("defineConfig is an identity helper", () => {
    const input = { defaultLocale: "en" };
    expect(defineConfig(input)).toBe(input);
  });
});

describe("build", () => {
  test("writes generated code", async () => {
    await writeFile(join(root, "locales", "ru-RU.toml"), RU);
    await writeFile(join(root, "locales", "en-US.toml"), EN);

    const config = resolveConfig({ defaultLocale: "ru-RU" }, root);
    const result = await build(config);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.locales).toEqual(["en-US", "ru-RU"]);

    const generatedDir = join(root, "locales", "generated");
    expect(existsSync(join(generatedDir, "messages", "ru-RU.ts"))).toBe(true);
    expect(existsSync(join(generatedDir, "messages", "en-US.ts"))).toBe(true);
    expect(existsSync(join(generatedDir, "schema.d.ts"))).toBe(true);
    expect(existsSync(join(generatedDir, "msgs.ts"))).toBe(true);
    expect(existsSync(join(generatedDir, "index.ts"))).toBe(true);

    const baked = await readFile(
      join(generatedDir, "messages", "ru-RU.ts"),
      "utf8",
    );
    expect(baked).toContain('"comments.sent": "Комментарий отправлен"');

    const schema = await readFile(join(generatedDir, "schema.d.ts"), "utf8");
    expect(schema).toContain('"comments.sent"');
  });

  test("fails on missing keys across locales", async () => {
    await writeFile(
      join(root, "locales", "ru-RU.toml"),
      `${RU}\n[extra]\nonly_ru = "только ру"\n`,
    );
    await writeFile(join(root, "locales", "en-US.toml"), EN);

    const config = resolveConfig({ defaultLocale: "ru-RU" }, root);
    const result = await build(config);

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("missing 1 key(s): extra.only_ru");
    expect(existsSync(join(root, "locales", "generated", "messages"))).toBe(false);
  });

  test("fails when defaultLocale has no file", async () => {
    await writeFile(join(root, "locales", "en-US.toml"), EN);
    const config = resolveConfig({ defaultLocale: "ru-RU" }, root);
    const result = await build(config);
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("has no matching locale file");
  });

  test("warns about fallback entries without a locale file", async () => {
    await writeFile(join(root, "locales", "ru-RU.toml"), RU);
    await writeFile(join(root, "locales", "en-US.toml"), EN);
    const config = resolveConfig(
      {
        defaultLocale: "ru-RU",
        fallback: { "ru-RU": ["en-US", "de-DE"] },
      },
      root,
    );
    const result = await build(config, { write: false });
    expect(result.ok).toBe(true);
    expect(result.warnings.join("\n")).toContain('"ru-RU" -> "de-DE"');
    expect(result.warnings.join("\n")).not.toContain('"ru-RU" -> "en-US"');
  });

  test("reports a read error other than a missing directory", async () => {
    await writeFile(join(root, "not-a-dir"), "x");
    const config = resolveConfig(
      { defaultLocale: "ru-RU", localesDir: "not-a-dir" },
      root,
    );
    const result = await build(config, { write: false });
    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toContain("cannot read locales directory");
  });

  test("leaves no temp files behind after writing", async () => {
    await writeFile(join(root, "locales", "ru-RU.toml"), RU);
    const result = await build(resolveConfig({ defaultLocale: "ru-RU" }, root));
    expect(result.ok).toBe(true);
    const generated = await readdir(join(root, "locales", "generated"), {
      recursive: true,
    });
    expect(generated.some((name) => name.includes("to18ml-tmp"))).toBe(false);
  });

  test("writes nothing in check mode", async () => {
    await writeFile(join(root, "locales", "ru-RU.toml"), RU);
    const config = resolveConfig({ defaultLocale: "ru-RU" }, root);
    const result = await build(config, { write: false });
    expect(result.ok).toBe(true);
    expect(existsSync(join(root, "locales", "generated"))).toBe(false);
  });

  test("rejects locale file names that are not xx or xx-YY", async () => {
    await writeFile(join(root, "locales", "ru-RU.toml"), RU);
    await writeFile(join(root, "locales", "ruRU.toml"), RU);
    await writeFile(join(root, "locales", "ru_RU.toml"), RU);
    const result = await build(resolveConfig({ defaultLocale: "ru-RU" }, root), {
      write: false,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.includes("ruRU.toml"))).toBe(true);
    expect(result.errors.some((error) => error.includes("ru_RU.toml"))).toBe(true);
    expect(result.errors.some((error) => error.includes("ru-RU.toml"))).toBe(false);
  });

  test("splits namespaces when requested", async () => {
    await writeFile(join(root, "locales", "ru-RU.toml"), RU);
    await writeFile(join(root, "locales", "en-US.toml"), EN);
    const config = resolveConfig(
      { defaultLocale: "ru-RU", split: true },
      root,
    );
    const result = await build(config);
    expect(result.ok).toBe(true);
    expect(
      existsSync(join(root, "locales", "generated", "namespaces", "ru-RU", "comments.ts")),
    ).toBe(true);
    const index = await readFile(
      join(root, "locales", "generated", "index.ts"),
      "utf8",
    );
    expect(index).toContain("loadNamespace");
    expect(index).not.toContain("./messages/");
    expect(existsSync(join(root, "locales", "generated", "messages"))).toBe(false);
  });
});
