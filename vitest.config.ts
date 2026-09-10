import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Without a local config, vitest walks up and loads the unrelated
// vite.config.ts in the parent checkout — pin the root here.
export default defineConfig({
  resolve: {
    // Forma array, non oggetto, e `find` come RegExp ancorate: una voce
    // stringa qui è un match di *prefisso*, quindi `react` cattura anche
    // `react/jsx-runtime` e lo riscrive in `…/react-stub.ts/jsx-runtime`.
    // L'ordine conta comunque — la prima che matcha vince.
    alias: [
      // `tsconfig.json` ha `"jsx": "react-jsx"`, quindi ogni `.tsx` viene
      // riscritto in import da `react/jsx-runtime`. Senza queste due voci i
      // file di test `.tsx` falliscono in *caricamento*, non in asserzione:
      // il totale dei test resta verde e la copertura sparisce in silenzio.
      {
        find: /^react\/jsx-dev-runtime$/,
        replacement: fileURLToPath(
          new URL("./src/test-support/react-jsx-runtime-stub.ts", import.meta.url),
        ),
      },
      {
        find: /^react\/jsx-runtime$/,
        replacement: fileURLToPath(
          new URL("./src/test-support/react-jsx-runtime-stub.ts", import.meta.url),
        ),
      },
      // React is peer-provided by the Steam webview (SP_REACT) and not
      // installed in node_modules — resolve it to a minimal stub so
      // steam-bridge modules can be imported under test.
      {
        find: /^react$/,
        replacement: fileURLToPath(
          new URL("./src/test-support/react-stub.ts", import.meta.url),
        ),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    // jsdom here has no localStorage; see the file for why that made
    // three suites fail for reasons unrelated to the code under test.
    setupFiles: ["./src/test-support/setup.ts"],
  },
});
