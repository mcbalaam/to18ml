import { placeholdersOf } from "../core/interpolate";
import { isPlural } from "../core/plural";
import type { FlatMessages } from "../core/types";

export type IssueLevel = "error" | "warning";

export interface CheckIssue {
  level: IssueLevel;
  message: string;
}

/** Union of every key across locales, sorted. */
function allKeys(locales: Record<string, FlatMessages>): string[] {
  const union = new Set<string>();
  for (const dict of Object.values(locales)) {
    for (const key of Object.keys(dict)) union.add(key);
  }
  return sorted(union);
}

function sorted(values: Iterable<string>): string[] {
  return [...values].sort();
}

/** Report placeholder differences between two sets. */
function diffParts(
  reference: Set<string>,
  names: Set<string>,
): string | undefined {
  const missing = sorted([...reference].filter((name) => !names.has(name)));
  const extra = sorted([...names].filter((name) => !reference.has(name)));
  if (missing.length === 0 && extra.length === 0) return undefined;
  const parts: string[] = [];
  if (missing.length > 0) parts.push(`missing {${missing.join("}, {")}}`);
  if (extra.length > 0) parts.push(`unexpected {${extra.join("}, {")}}`);
  return parts.join(", ");
}

/** All locales must share the same key set. */
export function checkKeyParity(
  locales: Record<string, FlatMessages>,
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const keys = allKeys(locales);

  for (const [locale, dict] of Object.entries(locales)) {
    const missing = keys.filter((key) => !Object.hasOwn(dict, key));
    if (missing.length > 0) {
      issues.push({
        level: "error",
        message:
          `locale "${locale}" is missing ${missing.length} key(s): ` +
          missing.join(", "),
      });
    }
  }
  return issues;
}

/** Placeholders for a key must match across locales. */
export function checkPlaceholders(
  locales: Record<string, FlatMessages>,
): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const key of allKeys(locales)) {
    const perLocale: { locale: string; names: Set<string> }[] = [];
    for (const [locale, dict] of Object.entries(locales)) {
      if (!Object.hasOwn(dict, key)) continue;
      const message = dict[key];
      if (message === undefined) continue;
      perLocale.push({ locale, names: placeholdersOf(message) });
    }

    const reference = perLocale[0];
    if (reference === undefined) continue;

    for (const { locale, names } of perLocale) {
      const parts = diffParts(reference.names, names);
      if (parts !== undefined) {
        issues.push({
          level: "error",
          message: `key "${key}" (locale "${locale}") placeholder mismatch: ${parts}`,
        });
      }
    }
  }
  return issues;
}

/** A key must be a string in every locale or a plural in every locale. */
export function checkMessageTypes(
  locales: Record<string, FlatMessages>,
): CheckIssue[] {
  const issues: CheckIssue[] = [];

  for (const key of allKeys(locales)) {
    const perLocale: { locale: string; kind: string }[] = [];
    for (const [locale, dict] of Object.entries(locales)) {
      if (!Object.hasOwn(dict, key)) continue;
      const message = dict[key];
      if (message === undefined) continue;
      perLocale.push({ locale, kind: isPlural(message) ? "plural" : "string" });
    }

    const kinds = new Set(perLocale.map((entry) => entry.kind));
    if (kinds.size > 1) {
      const detail = perLocale
        .map((entry) => `${entry.locale}=${entry.kind}`)
        .join(", ");
      issues.push({
        level: "error",
        message: `key "${key}" has inconsistent kind across locales: ${detail}`,
      });
    }
  }
  return issues;
}

/** Every variant of a plural in one locale must use the same placeholders. */
export function checkPluralVariants(
  locales: Record<string, FlatMessages>,
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  for (const [locale, dict] of Object.entries(locales)) {
    for (const [key, message] of Object.entries(dict)) {
      if (!isPlural(message)) continue;
      const variants = Object.entries(message).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      );
      const reference = variants[0];
      if (reference === undefined) continue;
      const referenceNames = placeholdersOf(reference[1]);
      for (const [category, variant] of variants.slice(1)) {
        const parts = diffParts(referenceNames, placeholdersOf(variant));
        if (parts !== undefined) {
          issues.push({
            level: "error",
            message:
              `plural key "${key}" (locale "${locale}", variant "${category}") ` +
              `placeholder mismatch vs "${reference[0]}": ${parts}`,
          });
        }
      }
    }
  }
  return issues;
}

/** Warn when a plural doesn't interpolate `{count}`. */
export function checkPluralCount(
  locales: Record<string, FlatMessages>,
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const reported = new Set<string>();
  for (const dict of Object.values(locales)) {
    for (const [key, message] of Object.entries(dict)) {
      if (!isPlural(message)) continue;
      if (reported.has(key)) continue;
      const names = placeholdersOf(message);
      if (!names.has("count")) {
        reported.add(key);
        issues.push({
          level: "warning",
          message: `plural key "${key}" does not interpolate {count}`,
        });
      }
    }
  }
  return issues;
}

export interface CheckOptions {
  /** Treat empty strings as errors. */
  strictEmpty?: boolean;
}

/** Flag empty translations. */
export function checkEmptyStrings(
  locales: Record<string, FlatMessages>,
  options: CheckOptions = {},
): CheckIssue[] {
  const issues: CheckIssue[] = [];
  const level: IssueLevel = options.strictEmpty ? "error" : "warning";
  for (const [locale, dict] of Object.entries(locales)) {
    for (const [key, message] of Object.entries(dict)) {
      if (typeof message === "string") {
        if (message.trim() === "") {
          issues.push({
            level,
            message: `locale "${locale}": empty string for key "${key}"`,
          });
        }
        continue;
      }
      for (const [category, variant] of Object.entries(message)) {
        if (typeof variant === "string" && variant.trim() === "") {
          issues.push({
            level,
            message: `locale "${locale}": empty "${category}" variant for key "${key}"`,
          });
        }
      }
    }
  }
  return issues;
}

/** Run every cross-locale check. */
export function runChecks(
  locales: Record<string, FlatMessages>,
  options: CheckOptions = {},
): CheckIssue[] {
  return [
    ...checkKeyParity(locales),
    ...checkMessageTypes(locales),
    ...checkPlaceholders(locales),
    ...checkPluralVariants(locales),
    ...checkPluralCount(locales),
    ...checkEmptyStrings(locales, options),
  ];
}
