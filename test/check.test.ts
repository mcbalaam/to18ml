import { describe, expect, test } from "bun:test";
import {
  checkEmptyStrings,
  checkKeyParity,
  checkMessageTypes,
  checkPlaceholders,
  checkPluralCount,
  checkPluralVariants,
  runChecks,
} from "../src/check";
import type { FlatMessages } from "../src";

describe("checkKeyParity", () => {
  test("flags keys missing from a locale", () => {
    const locales: Record<string, FlatMessages> = {
      en: { "a.b": "x" },
      ru: {},
    };
    const issues = checkKeyParity(locales);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("error");
    expect(issues[0]?.message).toContain('"ru" is missing 1 key(s): a.b');
  });

  test("passes when key sets match", () => {
    const locales: Record<string, FlatMessages> = {
      en: { "a.b": "x" },
      ru: { "a.b": "y" },
    };
    expect(checkKeyParity(locales)).toEqual([]);
  });
});

describe("checkPlaceholders", () => {
  test("flags placeholder mismatches", () => {
    const locales: Record<string, FlatMessages> = {
      en: { greet: "Hi, {name}!" },
      ru: { greet: "Привет!" },
    };
    const issues = checkPlaceholders(locales);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("missing {name}");
  });

  test("treats placeholders in any plural variant as present", () => {
    const locales: Record<string, FlatMessages> = {
      en: { items: { one: "{count} item", other: "{count} items" } },
      ru: { items: { one: "{count} товар", other: "{count} товара" } },
    };
    expect(checkPlaceholders(locales)).toEqual([]);
  });
});

describe("checkMessageTypes", () => {
  test("flags a key that is a string in one locale and a plural in another", () => {
    const locales: Record<string, FlatMessages> = {
      en: { items: "{count} items" },
      ru: { items: { one: "{count} товар", other: "{count} товара" } },
    };
    const issues = checkMessageTypes(locales);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("error");
    expect(issues[0]?.message).toContain("inconsistent kind");
  });

  test("passes when every locale agrees", () => {
    const locales: Record<string, FlatMessages> = {
      en: { items: { one: "x", other: "y" } },
      ru: { items: { one: "x", other: "y" } },
    };
    expect(checkMessageTypes(locales)).toEqual([]);
  });
});

describe("checkPluralVariants", () => {
  test("flags a variant whose placeholders differ from the others", () => {
    const locales: Record<string, FlatMessages> = {
      ru: {
        items: {
          one: "{count} товар",
          few: "товара",
          other: "{count} товара",
        },
      },
    };
    const issues = checkPluralVariants(locales);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("error");
    expect(issues[0]?.message).toContain('variant "few"');
    expect(issues[0]?.message).toContain("missing {count}");
  });

  test("passes when all variants share placeholders", () => {
    const locales: Record<string, FlatMessages> = {
      ru: {
        items: {
          one: "{count} товар для {name}",
          other: "{count} товара для {name}",
        },
      },
    };
    expect(checkPluralVariants(locales)).toEqual([]);
  });
});

describe("checkPluralCount", () => {
  test("warns when a plural does not interpolate {count}", () => {
    const locales: Record<string, FlatMessages> = {
      en: { items: { one: "an item", other: "items" } },
    };
    const issues = checkPluralCount(locales);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.level).toBe("warning");
  });
});

describe("checkEmptyStrings", () => {
  test("warns about empty strings by default", () => {
    const issues = checkEmptyStrings({ en: { a: "  " } });
    expect(issues[0]?.level).toBe("warning");
  });

  test("escalates to errors with strictEmpty", () => {
    const issues = checkEmptyStrings({ en: { a: "" } }, { strictEmpty: true });
    expect(issues[0]?.level).toBe("error");
  });
});

describe("runChecks", () => {
  test("aggregates every check", () => {
    const locales: Record<string, FlatMessages> = {
      en: { greet: "Hi, {name}!", items: { one: "x", other: "y" } },
      ru: { greet: "Привет!" },
    };
    const issues = runChecks(locales);
    const messages = issues.map((issue) => issue.message).join("\n");
    expect(messages).toContain("missing 1 key(s)");
    expect(messages).toContain("placeholder mismatch");
  });
});
