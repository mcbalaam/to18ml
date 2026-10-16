import { defineConfig } from "@mcbalaam/to18ml/config";

export default defineConfig({
  localesDir: "locales",
  generatedDir: "locales/generated",
  defaultLocale: "ru-RU",
  // fallback: { "ru-RU": ["en-US"] }, // explicit chain override
  // split: true,                      // per-namespace modules + loadNamespace
});
