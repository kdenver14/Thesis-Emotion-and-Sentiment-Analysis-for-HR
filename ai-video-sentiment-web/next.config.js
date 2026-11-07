/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  // The project sits in iCloud-synced Desktop; iCloud skips names ending in
  // .nosync, so build output (rewritten on every compile) is not uploaded.
  distDir: ".next.nosync",
};

export default config;
