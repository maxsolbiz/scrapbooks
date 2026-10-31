import type { NextConfig } from "next";
import os from "node:os";

// Non-loopback IPv4 addresses of this host (LAN, Wi-Fi, VPN, etc.).
// Recomputed on every dev start so a changed IP/network needs no config edit.
const localIPs = Object.values(os.networkInterfaces())
  .flat()
  .filter(
    (i): i is os.NetworkInterfaceInfo =>
      !!i && i.family === "IPv4" && !i.internal && Boolean(i.address),
  )
  .map((i) => i.address);

// Optional extras via env, e.g. ALLOWED_DEV_ORIGINS=mypc.local,dev.example.com
const extra = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const allowedDevOrigins = [...new Set([...localIPs, ...extra])];

const nextConfig: NextConfig = {
  /* fully-authenticated dynamic app: classic rendering model */
  cacheComponents: false,
  partialPrefetching: false,
  allowedDevOrigins,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
