import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.tsx"],
  format: ["esm"],
  platform: "node",
  target: "es2022",
  dts: false,
  clean: true,
});
