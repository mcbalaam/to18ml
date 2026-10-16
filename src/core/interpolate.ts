import type { Message } from "./types";

/** Matches escaped braces and `{placeholder}` tokens in one pass. */
const TOKEN = /\{\{|\}\}|\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

/** Replace `{name}` from `args`; `{{`/`}}` escape braces; unknown keys are left as-is. */
export function interpolate(
  template: string,
  args?: Record<string, unknown>,
): string {
  if (!template) return template;

  return template.replace(TOKEN, (match, name: string | undefined) => {
    if (name === undefined) {
      return match === "{{" ? "{" : "}";
    }
    if (args && Object.hasOwn(args, name)) {
      const value = args[name];
      if (value !== null && value !== undefined) return String(value);
    }
    return match;
  });
}

/** Placeholder names used in a template. */
export function placeholders(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(TOKEN)) {
    if (match[1] !== undefined && !found.includes(match[1])) {
      found.push(match[1]);
    }
  }
  return found;
}

/** Union of placeholder names across a message (all plural variants). */
export function placeholdersOf(message: Message): Set<string> {
  if (typeof message === "string") return new Set(placeholders(message));
  const found = new Set<string>();
  for (const variant of Object.values(message)) {
    if (typeof variant !== "string") continue;
    for (const name of placeholders(variant)) found.add(name);
  }
  return found;
}
