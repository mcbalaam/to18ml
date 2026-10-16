import {
  createContext,
  createElement,
  useContext,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { I18n, MessageSchema, TFunction, UntypedSchema } from "../core/types";

const I18nContext = createContext<I18n<UntypedSchema> | null>(null);

export interface I18nProviderProps<S extends MessageSchema> {
  i18n: I18n<S>;
  children?: ReactNode;
}

/** Provide an i18n instance to the tree. */
export function I18nProvider<S extends MessageSchema>(
  props: I18nProviderProps<S>,
): ReactNode {
  // The context is intentionally erased to `UntypedSchema`; consumers re-apply
  // their concrete schema through the generic hooks.
  return createElement(
    I18nContext.Provider,
    { value: props.i18n as unknown as I18n<UntypedSchema> },
    props.children,
  );
}

/** Current instance; throws outside `<I18nProvider>`. */
export function useI18n<S extends MessageSchema = UntypedSchema>(): I18n<S> {
  const value = useContext(I18nContext);
  if (value === null) {
    throw new Error("[to18ml] useI18n must be used within <I18nProvider>");
  }
  return value as unknown as I18n<S>;
}

/** Active locale; re-renders on change. */
export function useLocale(): string {
  const i18n = useI18n();
  return useSyncExternalStore(
    i18n.subscribe,
    () => i18n.locale,
    () => i18n.locale,
  );
}

/**
 * Translation function; re-renders on locale change.
 *
 * `useLocale()` is subscribed deliberately: `t` itself is stable, so without a
 * subscription the component would not re-render after `setLocale`.
 */
export function useT<S extends MessageSchema = UntypedSchema>(): TFunction<S> {
  const i18n = useI18n<S>();
  useLocale();
  return i18n.t;
}
