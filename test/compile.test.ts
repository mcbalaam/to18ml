import { describe, expect, test } from "bun:test";
import { compileLocale, compileToml } from "../src/compile";

describe("compileToml", () => {
  test("flattens tables into dotted keys", () => {
    const messages = compileToml(
      `[master]
welcome = "Hi"

[settings.theme]
dark = "Dark"
`,
      "en",
    );
    expect(messages).toEqual({
      "master.welcome": "Hi",
      "settings.theme.dark": "Dark",
    });
  });

  test("parses a `plural` table as a plural message", () => {
    const messages = compileToml(
      `[cart.items.plural]
one = "{count} item"
other = "{count} items"
`,
      "en",
    );
    expect(messages["cart.items"]).toEqual({
      one: "{count} item",
      other: "{count} items",
    });
  });

  test("sorts keys for stable output", () => {
    const messages = compileToml(
      `[z]
a = "1"
b = "2"

[a]
b = "3"
`,
      "en",
    );
    expect(Object.keys(messages)).toEqual(["a.b", "z.a", "z.b"]);
  });

  test("handles an empty document", () => {
    expect(compileToml("", "en")).toEqual({});
  });
});

describe("compileLocale errors", () => {
  test("rejects a root-level scalar", () => {
    const { errors, messages } = compileLocale(`welcome = "Hi"`, "en");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("welcome");
    expect(errors[0]?.message).toContain("root-level values must be tables");
    expect(messages).toEqual({});
  });

  test("rejects a `plural` table at the root", () => {
    const { errors } = compileLocale(
      `[plural]
one = "a"
other = "b"
`,
      "en",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("not at the root");
  });

  test("rejects a plural table without `other`", () => {
    const { errors } = compileLocale(
      `[items.plural]
one = "a"
few = "b"
`,
      "en",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("items");
    expect(errors[0]?.message).toContain("`other`");
  });

  test("rejects unknown plural categories", () => {
    const { errors } = compileLocale(
      `[items.plural]
other = "a"
Other = "b"
`,
      "en",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('unknown plural category "Other"');
  });

  test("rejects other keys next to a plural table", () => {
    const { errors } = compileLocale(
      `[items]
extra = "x"

[items.plural]
other = "a"
`,
      "en",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("items");
    expect(errors[0]?.message).toContain("extra");
  });

  test("rejects namespace names that could escape the output dir", () => {
    const { errors } = compileLocale(
      `["../evil"]
a = "x"

["ok-name_1"]
b = "y"
`,
      "en",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("../evil");
    expect(errors[0]?.message).toContain("namespace name");
  });

  test("rejects a scalar `plural` key", () => {
    const { errors } = compileLocale(`[items]\nplural = "x"\n`, "en");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("items");
    expect(errors[0]?.message).toContain("must be a table");
  });

  test("rejects an inline plural table with non-string variants", () => {
    const { errors } = compileLocale(
      `[items.plural]
other = "a"
one = 1
`,
      "en",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain('"one" must be a string');
  });

  test("rejects numbers, booleans and arrays", () => {
    const { errors } = compileLocale(
      `[a]
n = 5
b = true
list = [1, 2]
`,
      "en",
    );
    expect(errors).toHaveLength(3);
    expect(errors.map((error) => error.path).sort()).toEqual([
      "a.b",
      "a.list",
      "a.n",
    ]);
  });

  test("reports flat key collisions instead of overwriting", () => {
    const { errors } = compileLocale(
      `[x]
"y.z" = "one"

[x.y]
z = "two"
`,
      "en",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]?.path).toBe("x.y.z");
    expect(errors[0]?.message).toContain("duplicate key");
  });

  test("rejects the reserved __proto__ key", () => {
    const { errors } = compileLocale(`[a]\n"__proto__" = "x"\n`, "en");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("reserved");
  });

  test("returns an empty dict when a walk error occurs", () => {
    const { errors, messages } = compileLocale(
      `[a]
x = "1"
n = 5
`,
      "en",
    );
    expect(errors).toHaveLength(1);
    expect(messages).toEqual({});
  });

  test("reports TOML parse errors", () => {
    const { errors } = compileLocale(`[a]\nkey = `, "en");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toContain("TOML parse error");
  });
});
