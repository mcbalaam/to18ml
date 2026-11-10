import { watch } from "node:fs";

/** Watch a locale directory and rerun generation after filesystem changes. */
export function watchLocales(
  directory: string,
  rebuild: () => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pending = Promise.resolve();
    const watcher = watch(directory, () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        pending = pending
          .then(rebuild)
          .catch((error: unknown) => {
            console.error(`error: ${error instanceof Error ? error.message : String(error)}`);
          });
      }, 50);
    });

    watcher.on("error", (error) => {
      if (timer !== undefined) clearTimeout(timer);
      watcher.close();
      reject(error);
    });
    watcher.on("close", () => {
      if (timer !== undefined) clearTimeout(timer);
      void pending.finally(resolve);
    });
  });
}
