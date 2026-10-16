/** CLDR plural categories (`Intl.PluralRules`). */
export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

/** Plural variants by category; `other` is required. */
export type PluralMessage = Partial<Record<PluralCategory, string>> & {
  other: string;
};

/** A baked message: a string or plural variants. */
export type Message = string | PluralMessage;

/** Flat dotted-key dictionary for one locale. */
export type FlatMessages = Record<string, Message>;

/** Schema contract: declares valid keys; `args`/`plural` are read structurally. */
export interface MessageSchema {
  keys: string;
}

/** Permissive schema for untyped `createI18n`. */
export interface UntypedSchema extends MessageSchema {
  keys: string;
  args: Record<string, Record<string, unknown> | undefined>;
  plural: string;
}

/** `args` map of a schema, or `{}`. */
export type ArgsMap<S extends MessageSchema> = S extends { args: infer A }
  ? A
  : {};

/** Valid keys of a schema. */
export type KeyOf<S extends MessageSchema> = S["keys"];

/** Trailing params for `t`: required, optional, or forbidden by key. */
export type ArgsTuple<S extends MessageSchema, K extends string> =
  K extends keyof ArgsMap<S>
    ? undefined extends ArgsMap<S>[K]
      ? [args?: ArgsMap<S>[K]]
      : [args: ArgsMap<S>[K]]
    : [args?: never];

/** Translation function; keys and args are typed from the schema. */
export type TFunction<S extends MessageSchema> = <K extends KeyOf<S>>(
  key: K,
  ...args: ArgsTuple<S, K>
) => string;

/** Instance returned by `createI18n`. */
export interface I18n<S extends MessageSchema = UntypedSchema> {
  /** Active locale. */
  readonly locale: string;
  /** Translate a key. */
  readonly t: TFunction<S>;
  /** Switch locale and notify. */
  setLocale(locale: string): void;
  /** Merge (e.g. lazy) messages and notify. */
  addMessages(locale: string, messages: FlatMessages): void;
  /** Subscribe to changes; returns an unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Whether a key resolves in the chain. */
  has(key: string): boolean;
}
