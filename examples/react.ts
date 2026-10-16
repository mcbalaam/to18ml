import { createElement } from "react";
import { createI18n } from "@mcbalaam/to18ml";
import { I18nProvider, useLocale, useT } from "@mcbalaam/to18ml/adapters/react";
import { defaultLocale, messages } from "./locales/generated";
import type { Messages } from "./locales/generated";

const i18n = createI18n<Messages>({
  locale: defaultLocale,
  messages,
  defaultLocale,
});

function Greeting(): ReturnType<typeof createElement> {
  const t = useT<Messages>();
  const locale = useLocale();
  return createElement("p", null, `${locale}: ${t("comments.greet", { name: "Аня" })}`);
}

export function App(): ReturnType<typeof createElement> {
  return createElement(I18nProvider, { i18n }, createElement(Greeting));
}
