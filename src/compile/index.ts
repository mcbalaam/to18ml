import { parse } from "smol-toml";
import type { FlatMessages, Message, PluralMessage } from "../core/types";

const PLURAL_CATEGORIES = [
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
] as const;
const CATEGORY_SET = new Set<string>(PLURAL_CATEGORIES);
const PLURAL_KEY = "plural";
const NAMESPACE_RE = /^[A-Za-z0-9_-]+$/;

export class TomlCompileError extends Error {
  readonly locale: string;
  readonly path: string | undefined;

  constructor(locale: string, message: string, path?: string) {
    super(path ? `${locale}: ${path}: ${message}` : `${locale}: ${message}`);
    this.name = "TomlCompileError";
    this.locale = locale;
    this.path = path;
  }
}

export interface CompileResult {
  locale: string;
  /** Flat dict; empty when `errors` is non-empty. */
  messages: FlatMessages;
  errors: TomlCompileError[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (value instanceof Date) return "date";
  return typeof value;
}

function normalizePlural(
  value: Record<string, unknown>,
  locale: string,
  path: string,
  errors: TomlCompileError[],
): PluralMessage | undefined {
  const result: Partial<Record<string, string>> = {};
  let valid = true;
  for (const [category, variant] of Object.entries(value)) {
    if (!CATEGORY_SET.has(category)) {
      errors.push(
        new TomlCompileError(
          locale,
          `unknown plural category "${category}"`,
          path,
        ),
      );
      valid = false;
      continue;
    }
    if (typeof variant !== "string") {
      errors.push(
        new TomlCompileError(
          locale,
          `plural variant "${category}" must be a string (got ${typeName(variant)})`,
          path,
        ),
      );
      valid = false;
      continue;
    }
    result[category] = variant;
  }
  if (result.other === undefined) {
    errors.push(
      new TomlCompileError(
        locale,
        "plural message must declare an `other` variant",
        path,
      ),
    );
    valid = false;
  }
  return valid ? (result as PluralMessage) : undefined;
}

function store(
  out: FlatMessages,
  path: string,
  value: Message,
  locale: string,
  errors: TomlCompileError[],
): void {
  if (Object.hasOwn(out, path)) {
    errors.push(
      new TomlCompileError(locale, "duplicate key (already defined)", path),
    );
    return;
  }
  out[path] = value;
}

/** A table holding `plural` is a message at `prefix`; it must contain nothing else. */
function collectPlural(
  node: Record<string, unknown>,
  prefix: string,
  locale: string,
  out: FlatMessages,
  errors: TomlCompileError[],
): void {
  if (prefix === "") {
    errors.push(
      new TomlCompileError(
        locale,
        "`plural` must be inside a namespace, not at the root",
        PLURAL_KEY,
      ),
    );
    return;
  }

  const siblings = Object.keys(node).filter((key) => key !== PLURAL_KEY);
  if (siblings.length > 0) {
    errors.push(
      new TomlCompileError(
        locale,
        `plural message cannot have other keys: ${siblings.join(", ")}`,
        prefix,
      ),
    );
    return;
  }

  const variants = node[PLURAL_KEY];
  if (!isPlainObject(variants)) {
    errors.push(
      new TomlCompileError(
        locale,
        "`plural` must be a table of plural variants",
        prefix,
      ),
    );
    return;
  }

  const message = normalizePlural(variants, locale, prefix, errors);
  if (message !== undefined) store(out, prefix, message, locale, errors);
}

function walk(
  node: Record<string, unknown>,
  prefix: string,
  locale: string,
  out: FlatMessages,
  errors: TomlCompileError[],
): void {
  if (Object.hasOwn(node, PLURAL_KEY)) {
    collectPlural(node, prefix, locale, out, errors);
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (key === "__proto__") {
      errors.push(
        new TomlCompileError(locale, "key `__proto__` is reserved", path),
      );
      continue;
    }

    if (typeof value === "string") {
      store(out, path, value, locale, errors);
      continue;
    }

    if (isPlainObject(value)) {
      walk(value, path, locale, out, errors);
      continue;
    }

    errors.push(
      new TomlCompileError(
        locale,
        `unsupported value (${typeName(value)}); expected a string or a table`,
        path,
      ),
    );
  }
}

/** Return a key-sorted copy. */
export function sortMessages(messages: FlatMessages): FlatMessages {
  const sorted: FlatMessages = {};
  for (const key of Object.keys(messages).sort()) {
    const value = messages[key];
    if (value !== undefined) sorted[key] = value;
  }
  return sorted;
}

/** Compile TOML into a flat dict, collecting all errors. */
export function compileLocale(source: string, locale: string): CompileResult {
  const errors: TomlCompileError[] = [];
  const out: FlatMessages = {};

  let document: unknown;
  try {
    document = parse(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      locale,
      messages: out,
      errors: [new TomlCompileError(locale, `TOML parse error: ${message}`)],
    };
  }

  if (!isPlainObject(document)) {
    return {
      locale,
      messages: out,
      errors: [
        new TomlCompileError(locale, "document root must be a table"),
      ],
    };
  }

  // Root: namespaces only.
  for (const [key, value] of Object.entries(document)) {
    if (!isPlainObject(value)) {
      errors.push(
        new TomlCompileError(
          locale,
          "root-level values must be tables (namespaces); messages must live inside a table",
          key,
        ),
      );
    } else if (!NAMESPACE_RE.test(key)) {
      errors.push(
        new TomlCompileError(
          locale,
          "namespace name may contain only letters, digits, `_` and `-`",
          key,
        ),
      );
    }
  }

  if (errors.length === 0) walk(document, "", locale, out, errors);

  // On any error, return an empty dict so callers never see partial output.
  const messages = errors.length === 0 ? sortMessages(out) : {};
  return { locale, messages, errors };
}

/** Compile TOML, throwing on the first error. */
export function compileToml(source: string, locale: string): FlatMessages {
  const result = compileLocale(source, locale);
  const first = result.errors[0];
  if (first !== undefined) throw first;
  return result.messages;
}
