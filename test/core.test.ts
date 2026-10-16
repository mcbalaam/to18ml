import { describe, expect, test } from "bun:test";
import { createI18n, interpolate, placeholders, selectPlural } from "../src";
import type { FlatMessages, MessageSchema } from "../src";

const messages = {
  "ru-RU": {
    "master.welcome": "Добро пожаловать!",
    "master.goodbye": "До свидания!",
    "comments.greet": "Привет, {name}!",
    "cart.items": {
      one: "{count} товар",
      few: "{count} товара",
      many: "{count} товаров",
      other: "{count} товара",
    },
  },
  ru: {
    "comments.sent": "Комментарий отправлен",
  },
  en: {
    "comments.sent": "Comment sent",
    "cart.items": {
      one: "{count} item",
      other: "{count} items",
    },
  },
} satisfies Record<string, FlatMessages>;

describe("interpolate", () => {
  test("replaces placeholders", () => {
    expect(interpolate("Привет, {name}!", { name: "Аня" })).toBe("Привет, Аня!");
  });

  test("coerces numbers to strings", () => {
    expect(interpolate("{count} товаров", { count: 5 })).toBe("5 товаров");
  });

  test("unescapes doubled braces", () => {
    expect(interpolate("{{name}}", { name: "Аня" })).toBe("{name}");
  });

  test("leaves unknown placeholders untouched", () => {
    expect(interpolate("Привет, {name}!")).toBe("Привет, {name}!");
    expect(interpolate("{a} {b}", { a: 1 })).toBe("1 {b}");
  });

  test("extracts placeholder names", () => {
    expect(placeholders("{a} {{b}} {c}")).toEqual(["a", "c"]);
  });
});

describe("selectPlural", () => {
  test("uses CLDR categories for Russian", () => {
    const msg = messages["ru-RU"]["cart.items"];
    if (typeof msg === "string") throw new Error("expected plural message");
    expect(selectPlural(msg, "ru-RU", 1)).toBe("{count} товар");
    expect(selectPlural(msg, "ru-RU", 2)).toBe("{count} товара");
    expect(selectPlural(msg, "ru-RU", 5)).toBe("{count} товаров");
    expect(selectPlural(msg, "ru-RU", 21)).toBe("{count} товар");
  });
});

describe("createI18n", () => {
  test("translates a direct key", () => {
    const i18n = createI18n({ locale: "ru-RU", messages, dev: false });
    expect(i18n.t("master.welcome")).toBe("Добро пожаловать!");
  });

  test("falls back ru-RU -> ru", () => {
    const i18n = createI18n({ locale: "ru-RU", messages, dev: false });
    expect(i18n.t("comments.sent")).toBe("Комментарий отправлен");
    expect(i18n.has("comments.sent")).toBe(true);
  });

  test("falls back to defaultLocale", () => {
    const i18n = createI18n({
      locale: "de",
      defaultLocale: "en",
      messages,
      dev: false,
    });
    expect(i18n.t("comments.sent")).toBe("Comment sent");
  });

  test("interpolates arguments", () => {
    const i18n = createI18n({ locale: "ru-RU", messages, dev: false });
    expect(i18n.t("comments.greet", { name: "Аня" })).toBe("Привет, Аня!");
  });

  test("pluralizes with count", () => {
    const i18n = createI18n({ locale: "ru-RU", messages, dev: false });
    expect(i18n.t("cart.items", { count: 1 })).toBe("1 товар");
    expect(i18n.t("cart.items", { count: 3 })).toBe("3 товара");
    expect(i18n.t("cart.items", { count: 12 })).toBe("12 товаров");
  });

  test("plural resolves in the locale that owns the message", () => {
    const i18n = createI18n({
      locale: "ru-RU",
      defaultLocale: "en",
      messages,
      dev: false,
    });
    // `cart.items` is absent in `ru`, so it resolves via `en`.
    expect(i18n.has("cart.items")).toBe(true);
  });

  test("returns the key for a missing message", () => {
    const i18n = createI18n({ locale: "ru-RU", messages, dev: false });
    expect(i18n.t("nope.missing")).toBe("nope.missing");
    expect(i18n.has("nope.missing")).toBe(false);
  });

  test("supports a custom onMissing handler", () => {
    const i18n = createI18n({
      locale: "ru-RU",
      messages,
      dev: false,
      onMissing: (key) => `??${key}`,
    });
    expect(i18n.t("nope")).toBe("??nope");
  });

  test("rejects an invalid locale at construction", () => {
    expect(() =>
      createI18n({ locale: "not a locale", messages, dev: false }),
    ).toThrow('invalid locale "not a locale"');
  });

  test("rejects an invalid locale in setLocale", () => {
    const i18n = createI18n({ locale: "ru-RU", messages, dev: false });
    expect(() => i18n.setLocale("en_US")).toThrow("invalid locale");
    expect(i18n.locale).toBe("ru-RU");
  });

  test("warns about a non-finite count instead of reporting it missing", () => {
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message?: unknown) => {
      warnings.push(String(message));
    };
    try {
      const i18n = createI18n({ locale: "ru-RU", messages, dev: true });
      expect(typeof i18n.t("cart.items", { count: Number.NaN })).toBe("string");
    } finally {
      console.warn = original;
    }
    expect(warnings.join("\n")).toContain("invalid `count`");
    expect(warnings.join("\n")).not.toContain("missing `count`");
  });

  test("setLocale notifies subscribers", () => {
    const i18n = createI18n({ locale: "ru-RU", messages, dev: false });
    let calls = 0;
    const unsubscribe = i18n.subscribe(() => {
      calls += 1;
    });
    i18n.setLocale("en");
    expect(i18n.locale).toBe("en");
    expect(calls).toBe(1);
    expect(i18n.t("comments.sent")).toBe("Comment sent");

    unsubscribe();
    i18n.setLocale("ru-RU");
    expect(calls).toBe(1);
  });

  test("supports explicit fallback overrides", () => {
    const i18n = createI18n({
      locale: "ru-RU",
      messages,
      dev: false,
      fallback: { "ru-RU": ["en"] },
    });
    expect(i18n.t("comments.sent")).toBe("Comment sent");
  });

  test("merges lazily added messages and notifies", () => {
    const i18n = createI18n({
      locale: "ru-RU",
      messages: { "ru-RU": {} },
      dev: false,
    });
    expect(i18n.has("comments.sent")).toBe(false);

    let calls = 0;
    i18n.subscribe(() => {
      calls += 1;
    });
    i18n.addMessages("ru-RU", { "comments.sent": "Комментарий отправлен" });
    expect(i18n.t("comments.sent")).toBe("Комментарий отправлен");
    expect(calls).toBe(1);
  });
});

// Compile-time checks: typed schema narrows keys and arguments.
interface Msg extends MessageSchema {
  keys: "master.welcome" | "comments.greet";
  args: { "comments.greet": { name: string | number } };
  plural: never;
}

describe("typed usage", () => {
  const typed = createI18n<Msg>({ locale: "ru-RU", messages, dev: false });

  test("treats inherited Object.prototype names as missing", () => {
    const i18n = createI18n({
      locale: "en",
      messages: { en: { "a.b": "x {constructor}" } },
      dev: false,
    });
    expect(i18n.has("constructor")).toBe(false);
    expect(i18n.t("constructor")).toBe("constructor");
    expect(i18n.t("a.b", { constructor: "y" })).toBe("x y");
    expect(i18n.t("a.b", {})).toBe("x {constructor}");
  });

  test("accepts valid keys and args", () => {
    expect(typed.t("master.welcome")).toBe("Добро пожаловать!");
    expect(typed.t("comments.greet", { name: "Аня" })).toBe("Привет, Аня!");
  });

  test("rejects unknown keys and missing args at compile time", () => {
    // @ts-expect-error unknown key
    typed.t("nope");
    // @ts-expect-error args are required for keys with placeholders
    typed.t("comments.greet");
    // @ts-expect-error args are not accepted for keys without placeholders
    typed.t("master.welcome", { name: "Аня" });
    expect(true).toBe(true);
  });
});
