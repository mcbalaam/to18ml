import { describe, expect, test } from "bun:test";
import type { FlatMessages } from "../src";
import {
  analyze,
  generate,
  localeIdent,
  splitNamespaces,
} from "../src/codegen";

const locales: Record<string, FlatMessages> = {
  "ru-RU": {
    "master.welcome": "Добро пожаловать!",
    "comments.greet": "Привет, {name}!",
    "cart.items": { one: "{count} товар", other: "{count} товара" },
  },
  "en-US": {
    "master.welcome": "Welcome!",
    "comments.greet": "Hi, {name}!",
    "cart.items": { one: "{count} item", other: "{count} items" },
  },
};

describe("localeIdent", () => {
  test("builds safe identifiers", () => {
    expect(localeIdent("ru-RU")).toBe("ruRU");
    expect(localeIdent("en")).toBe("en");
    expect(localeIdent("zh-Hans-CN")).toBe("zhHansCN");
  });
});

describe("analyze", () => {
  test("derives plural flags and placeholder unions", () => {
    const infos = analyze(locales);
    const greet = infos.find((info) => info.key === "comments.greet");
    expect(greet).toEqual({
      key: "comments.greet",
      plural: false,
      placeholders: ["name"],
    });
    const items = infos.find((info) => info.key === "cart.items");
    expect(items?.plural).toBe(true);
    expect(items?.placeholders).toEqual(["count"]);
  });
});

describe("generate", () => {
  const files = generate(locales, { defaultLocale: "ru-RU" });

  test("emits a typed schema", () => {
    const schema = files["schema.d.ts"] as string;
    expect(schema).toContain(
      'import type { MessageSchema } from "@mcbalaam/to18ml"',
    );
    expect(schema).toContain('| "master.welcome"');
    expect(schema).toContain('"comments.greet": { name: string | number };');
    expect(schema).toContain('"cart.items": { count: number };');
    expect(schema).toContain('| "cart.items"');
  });

  test("emits the msgs key object", () => {
    const msgs = files["msgs.ts"] as string;
    expect(msgs).toContain("comments: {");
    expect(msgs).toContain('greet: "comments.greet",');
    expect(msgs).toContain('items: "cart.items",');
  });

  test("emits a barrel with the message map", () => {
    const index = files["index.ts"] as string;
    expect(index).toContain('export const defaultLocale = "ru-RU";');
    expect(index).toContain('import ruRU from "./messages/ru-RU";');
    expect(index).toContain('"ru-RU": ruRU,');
  });

  test("emits baked TS modules", () => {
    const ru = files["messages/ru-RU.ts"] as string;
    expect(ru).toContain("const messages: FlatMessages = {");
    expect(ru).toContain('"comments.greet": "Привет, {name}!"');
    expect(ru).toContain("export default messages;");
  });

  test("adds a lazy loader when split is enabled", () => {
    const split = generate(locales, { defaultLocale: "ru-RU", split: true });
    expect(split["index.ts"]).toContain("export async function loadNamespace");
  });

  test("split barrel does not statically import any locale dictionary", () => {
    const split = generate(locales, { defaultLocale: "ru-RU", split: true });
    const index = split["index.ts"] as string;
    expect(index).not.toContain("./messages/");
    expect(index).not.toContain("export const messages");
    expect(Object.keys(split).some((name) => name.startsWith("messages/"))).toBe(false);
    expect(split["namespaces/ru-RU/comments.ts"]).toBeDefined();
  });

  test("split rejects a key without a namespace", () => {
    expect(() =>
      generate({ en: { dotted: "x" } }, { defaultLocale: "en", split: true }),
    ).toThrow("without a namespace");
  });

  test("split loader only accepts generated locale/namespace pairs", () => {
    const split = generate(locales, { defaultLocale: "ru-RU", split: true });
    const index = split["index.ts"] as string;
    expect(index).toContain('"ru-RU/comments",');
    expect(index).toContain('"ru-RU/master",');
    expect(index).not.toContain('"ru-RU/nope"');
    expect(index).toContain("if (!namespaceFiles.has(file))");
  });
});

describe("localeIdent", () => {
  test("keeps strict tags readable and escapes reserved words", () => {
    expect(localeIdent("ru-RU")).toBe("ruRU");
    expect(localeIdent("en")).toBe("en");
    expect(localeIdent("in")).toBe("in_");
    expect(localeIdent("if")).toBe("if_");
  });
});

describe("splitNamespaces", () => {
  test("buckets keys by their first segment", () => {
    const split = splitNamespaces({ "a.b": "1", "a.d": "2", c: "3" });
    expect(split).toEqual({
      a: { "a.b": "1", "a.d": "2" },
      "": { c: "3" },
    });
  });
});
