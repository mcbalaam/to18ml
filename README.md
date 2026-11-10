# to18ml: an i18n library for ants

to18ml is a framework-agnostic i18n library supporting pluralization and templates. Translations are written with **TOML**, but to18ml ships no parser to the frontend, instead baking strings to **TypeScript modules** at build time. Generates `.d.ts` to provide typing and snippets.

<img width="371" height="117" alt="screenshot_2026-11-10_20-21-08" src="https://github.com/user-attachments/assets/be0302d0-127a-4abd-86ec-a5fdbb072ab3" />
<br>
<sub>to18ml using less than 5KB in the bundle; visualization made with rollup-plugin-visualizer for Vite.</sub>
<br>
<br>
The build-time CLI runs on **Bun** (it loads `.ts` config and uses Bun's TypeScript loader). The runtime (`@mcbalaam/to18ml` and `@mcbalaam/to18ml/adapters/react`) is plain TypeScript and has no Bun dependency.

## Installing to18ml

```bash
bun add @mcbalaam/to18ml
```
> React adapter needs `react` (optional peer).

## Configuring to18ml

```ts
// to18ml.config.ts
import { defineConfig } from "@mcbalaam/to18ml/config";

export default defineConfig({
  localesDir: "locales",       // default
  generatedDir: "locales/generated", // default
  defaultLocale: "ru-RU",      // required
  // fallback: { "ru-RU": ["ru"] }, // optional explicit chain override
  // packageName: "@mcbalaam/to18ml", // used in generated imports
  // split: true,                   // emit per-namespace modules + loadNamespace
  // strictEmpty: false,            // empty strings => errors instead of warnings
});
```

## Using to18ml

### Working with locales

to18ml only currently allows one file per locale. The locale tag is the file name and must be `xx` or `xx-YY` (for example `ru.toml` or `ru-RU.toml`):

```toml
# locales/ru-RU.toml

[master]
welcome = "Добро пожаловать!"
goodbye = "До свидания!"

[comments]
leave_a_comment = "Оставьте комментарий"
sent = "Комментарий отправлен"
greet = "Привет, {name}!"

[cart.items.plural]
one = "{count} товар"
few = "{count} товара"
many = "{count} товаров"
other = "{count} товара"

[settings.theme]
dark = "Тёмная"
light = "Светлая"
```

A plural message is a `plural` table placed under the key it belongs to. `plural` is a reserved name: it cannot be used as a regular key. The table may contain only CLDR categories (`zero`, `one`, `two`, `few`, `many`, `other`), and `other` is required.

### Using CLI tools

```bash
to18ml          # generate modules + types
to18ml --check  # validate only, write nothing (great for CI)
```

Set `strictEmpty: true` in the config to fail the build on empty strings instead of warning about them.

Run it before dev/build, e.g. via scripts:

```json
{
  "scripts": {
    "predev": "to18ml",
    "prebuild": "to18ml"
  }
}
```

### Using in a project

```ts
import { createI18n } from "@mcbalaam/to18ml";
import { messages, defaultLocale, msgs } from "./locales/generated";
import type { Messages } from "./locales/generated";

export const i18n = createI18n<Messages>({
  locale: defaultLocale,
  messages,
  defaultLocale,
});

i18n.t("master.welcome");                    // "Добро пожаловать!"
i18n.t(msgs.comments.greet, { name: "Аня" }); // "Привет, Аня!" (typed + autocomplete)
i18n.t("cart.items", { count: 3 });           // "3 товара"

i18n.locale;                                  // current locale
i18n.setLocale("en-US");
i18n.has("comments.sent");                    // true
const off = i18n.subscribe(() => render());   // reactive hook for adapters
```

- Plural selection uses `Intl.PluralRules` on the **`count`** argument; `other` is
  the fallback. `count` must be a finite number.
- Missing keys: dev warns once, production returns the key (or a custom
  `onMissing(key, locale)`).
- Templates use `{name}` placeholders. `{{` and `}}` escape a literal `{`/`}`, so a
  lone `}}` in ordinary text renders as a single `}`.
- Values are interpolated **unescaped**. to18ml is safe with React/text nodes, but
  do not feed results to `innerHTML` with untrusted translations.

### Generating type safety

`to18ml` generates `locales/generated/` (git-ignored — it is a build artifact). The bundled `.gitignore` matches `**/locales/generated/`; if you set a custom `generatedDir`, add it to your `.gitignore` yourself.

| file | purpose |
| --- | --- |
| `messages/<locale>.ts` | baked flat dictionary (sorted keys); not emitted with `split` |
| `schema.d.ts` | `Messages` schema: `keys`, `args`, `plural` |
| `msgs.ts` | nested `const` of key strings (`msgs.comments.sent === "comments.sent"`) |
| `index.ts` | `messages` map, `defaultLocale`, re-exports; with `split`, `loadNamespace` instead of `messages` |

With `createI18n<Messages>(...)`, keys and arguments are checked at compile time:

```ts
i18n.t("comments.greet", { name: "Аня" }); // ok
i18n.t("nope");                            // X unknown key
i18n.t("comments.greet");                  // X missing required args
i18n.t("master.welcome", { name: "Аня" }); // X args not accepted
```

### Using with React

```ts
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { I18nProvider, useT, useLocale } from "@mcbalaam/to18ml/adapters/react";
import { i18n } from "./i18n";
import type { Messages } from "./locales/generated";

function Greeting() {
  const t = useT<Messages>();
  const locale = useLocale();
  return createElement("p", null, `${locale}: ${t("comments.greet", { name: "Аня" })}`);
}

export const App = () =>
  createElement(I18nProvider, { i18n }, createElement(Greeting));
```

The hooks subscribe through `i18n.subscribe` + `useSyncExternalStore`, so
components re-render on `setLocale` and on lazily added messages. SSR works as
long as the server and client start with the same locale and messages.

### SSR: one instance per request

`I18n` is mutable (`setLocale` and `addMessages`). On a server, create it inside
the request/render function—never as a module-level singleton. Otherwise one
request can change the locale seen by another request. Pass the same locale and
message data to the client for its first render to avoid hydration mismatches:

```tsx
import { createElement } from "react";
import { createI18n } from "@mcbalaam/to18ml";
import { I18nProvider } from "@mcbalaam/to18ml/adapters/react";
import { messages, defaultLocale } from "./locales/generated";
import type { Messages } from "./locales/generated";
import { App } from "./App";

// Call once for each incoming request (and separately in the browser).
export function renderRequest(locale: string) {
  // Validate/normalize the request locale before this point; use defaultLocale
  // when it is not supported.
  const i18n = createI18n<Messages>({ locale, messages, defaultLocale });
  return renderToString(
    createElement(I18nProvider, { i18n }, createElement(App)),
  );
}
```

The locale should come from your framework's request data (for example, a
validated route segment or cookie), not shared mutable state. Serialize the
chosen locale to the page and initialize the browser's instance with it too.

A namespace is a top-level table. Its name may contain only letters, digits, `_` and `-`.

The CLI looks for `to18ml.config.*` in the current directory and upward, but stops at the project root (a directory with `.git` or `package.json`) and never goes above the home directory.

### Lazy loading

With `split: true` the build emits `namespaces/<locale>/<namespace>.ts` instead of `messages/<locale>.ts`, and `index.ts` exports `loadNamespace()` instead of the `messages` map. Nothing is loaded until you ask for it, so the bundle only contains the namespaces you use:

```ts
import { loadNamespace } from "./locales/generated";

const i18n = createI18n<Messages>({ locale: "ru-RU", messages: {} });
i18n.addMessages("ru-RU", await loadNamespace("ru-RU", "comments"));
```

## Entry points

| import | contents |
| --- | --- |
| `@mcbalaam/to18ml` | runtime only (`createI18n`, types) — safe for the frontend |
| `@mcbalaam/to18ml/config` | `defineConfig` + build types (dev-side) |
| `@mcbalaam/to18ml/compile` | TOML → flat dict |
| `@mcbalaam/to18ml/codegen` | schema / msgs / barrel generation |
| `@mcbalaam/to18ml/check` | cross-locale checks |
| `@mcbalaam/to18ml/adapters/react` | React hooks + provider |

## Development

```bash
bun test        # run the test suite
bun run typecheck
```

## License

BSD-3-Clause. See [LICENSE](./LICENSE).
