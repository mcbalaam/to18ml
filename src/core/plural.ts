import type { PluralCategory, PluralMessage } from "./types";

const rulesCache = new Map<string, Intl.PluralRules>();

function rulesFor(locale: string): Intl.PluralRules {
  let rules = rulesCache.get(locale);
  if (rules === undefined) {
    rules = new Intl.PluralRules(locale);
    rulesCache.set(locale, rules);
  }
  return rules;
}

/** Whether a value is a plural variant table. */
export function isPlural(value: unknown): value is PluralMessage {
  return typeof value === "object" && value !== null;
}

/** Pick the variant for `count`, falling back to `other`. */
export function selectPlural(
  message: PluralMessage,
  locale: string,
  count: number,
): string {
  const category = rulesFor(locale).select(count) as PluralCategory;
  return message[category] ?? message.other;
}
