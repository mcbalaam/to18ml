import { interpolate } from "./interpolate";
import { isPlural, selectPlural } from "./plural";
import type {
  FlatMessages,
  I18n,
  Message,
  MessageSchema,
  UntypedSchema,
} from "./types";

export interface CreateI18nOptions {
  /** Active locale, e.g. `"ru-RU"`. */
  locale: string;
  /** Baked messages per locale. */
  messages: Record<string, FlatMessages>;
  /** Explicit chain per locale; defaults to `locale -> language -> defaultLocale`. */
  fallback?: Record<string, string[]>;
  /** Last-resort locale. */
  defaultLocale?: string;
  /** Called when a key is unresolved; defaults to returning the key. */
  onMissing?: (key: string, locale: string) => string;
  /** Warn on missing keys/args; defaults to `NODE_ENV !== "production"`. */
  dev?: boolean;
}

function language(locale: string): string {
  const dash = locale.indexOf("-");
  return dash === -1 ? locale : locale.slice(0, dash);
}

function buildChain(
  locale: string,
  defaultLocale: string | undefined,
  overrides: Record<string, string[]> | undefined,
): string[] {
  const chain: string[] = [];
  const push = (value: string | undefined): void => {
    if (value && !chain.includes(value)) chain.push(value);
  };

  const override = overrides?.[locale];
  if (override) {
    for (const entry of override) push(entry);
  } else {
    push(locale);
    push(language(locale));
  }

  push(defaultLocale);
  return chain;
}

function defaultDev(): boolean {
  if (typeof process !== "undefined" && process.env) {
    return process.env.NODE_ENV !== "production";
  }
  // No `process` (e.g. a browser without bundler defines): stay quiet to avoid
  // shipping dev warnings to production. Pass `dev: true` to opt in.
  return false;
}

/** Throw early with a clear message instead of a late `Intl` `RangeError`. */
function assertLocale(locale: string): void {
  try {
    Intl.getCanonicalLocales(locale);
  } catch {
    throw new Error(`to18ml: invalid locale "${locale}"`);
  }
}

/** Create a framework-agnostic i18n instance. */
export function createI18n<S extends MessageSchema = UntypedSchema>(
  options: CreateI18nOptions,
): I18n<S> {
  const { messages } = options;
  const dev = options.dev ?? defaultDev();
  const onMissing = options.onMissing ?? ((key: string) => key);

  assertLocale(options.locale);

  // Copy so addMessages never mutates the caller's map.
  const store: Record<string, FlatMessages> = { ...messages };

  let locale = options.locale;
  let chain = buildChain(locale, options.defaultLocale, options.fallback);
  const listeners = new Set<() => void>();
  const warned = new Set<string>();

  function warn(message: string, key: string): void {
    if (!dev) return;
    const id = `${locale}\u0000${key}\u0000${message}`;
    if (warned.has(id)) return;
    warned.add(id);
    console.warn(`[to18ml] ${message} "${key}" (locale: ${locale})`);
  }

  function notify(): void {
    for (const listener of listeners) listener();
  }

  function lookup(key: string): { value: Message; sourceLocale: string } | undefined {
    for (const candidate of chain) {
      if (!Object.hasOwn(store, candidate)) continue;
      const dict = store[candidate];
      if (dict === undefined || !Object.hasOwn(dict, key)) continue;
      const value = dict[key];
      if (value !== undefined) return { value, sourceLocale: candidate };
    }
    return undefined;
  }

  const t = (key: string, args?: Record<string, unknown>): string => {
    const found = lookup(key);
    if (found === undefined) {
      warn("missing message", key);
      return onMissing(key, locale);
    }

    const { value, sourceLocale } = found;
    if (typeof value === "string") return interpolate(value, args);

    if (!isPlural(value)) return String(value);

    const count = args?.["count"];
    if (typeof count === "number" && Number.isFinite(count)) {
      return interpolate(selectPlural(value, sourceLocale, count), args);
    }
    if (count === undefined) {
      warn("missing `count` for plural message", key);
    } else {
      warn("invalid `count` (expected a finite number) for plural message", key);
    }
    return interpolate(value.other, args);
  };

  const instance = {
    get locale(): string {
      return locale;
    },
    t,
    setLocale(next: string): void {
      if (next === locale) return;
      assertLocale(next);
      locale = next;
      chain = buildChain(locale, options.defaultLocale, options.fallback);
      notify();
    },
    addMessages(nextLocale: string, merged: FlatMessages): void {
      store[nextLocale] = { ...store[nextLocale], ...merged };
      notify();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    has(key: string): boolean {
      return lookup(key) !== undefined;
    },
  };

  // `t` is built untyped; the schema-based `I18n<S>` surface is applied here.
  return instance as unknown as I18n<S>;
}
