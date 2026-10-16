import { createI18n } from "@mcbalaam/to18ml";
import { defaultLocale, messages, msgs } from "./locales/generated";
import type { Messages } from "./locales/generated";

const i18n = createI18n<Messages>({
  locale: defaultLocale,
  messages,
  defaultLocale,
});

console.log(i18n.t("master.welcome"));
console.log(i18n.t(msgs.comments.greet, { name: "Аня" }));
console.log(i18n.t("comments.sent"));

for (const count of [1, 2, 5, 21]) {
  console.log(i18n.t("cart.items", { count }));
}

i18n.setLocale("en-US");
console.log(i18n.t("comments.sent"));
console.log(i18n.t("cart.items", { count: 3 }));

// Uncommenting any of these fails `tsc`.
// i18n.t("nope");
// i18n.t("comments.greet");
// i18n.t("master.welcome", { name: "Аня" });
