import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createI18n } from "../src";
import type { FlatMessages } from "../src";
import { I18nProvider, useLocale, useT } from "../src/adapters/react";

const messages: Record<string, FlatMessages> = {
  "ru-RU": {
    "comments.sent": "Комментарий отправлен",
    "comments.greet": "Привет, {name}!",
  },
  "en-US": {
    "comments.sent": "Comment sent",
    "comments.greet": "Hi, {name}!",
  },
};

function Widget(): ReturnType<typeof createElement> {
  const t = useT();
  const locale = useLocale();
  return createElement("span", null, `${locale}|${t("comments.sent")}`);
}

describe("react adapter", () => {
  test("renders with the active locale (SSR)", () => {
    const i18n = createI18n({ locale: "ru-RU", messages, dev: false });
    const html = renderToStaticMarkup(
      createElement(I18nProvider, { i18n }, createElement(Widget)),
    );
    expect(html).toBe("<span>ru-RU|Комментарий отправлен</span>");
  });

  test("renders the fallback locale", () => {
    const i18n = createI18n({
      locale: "en-US",
      messages,
      dev: false,
    });
    const html = renderToStaticMarkup(
      createElement(I18nProvider, { i18n }, createElement(Widget)),
    );
    expect(html).toBe("<span>en-US|Comment sent</span>");
  });

  test("throws when used outside I18nProvider", () => {
    expect(() =>
      renderToStaticMarkup(createElement(Widget)),
    ).toThrow();
  });
});
