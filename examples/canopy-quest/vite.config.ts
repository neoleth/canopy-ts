import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // A Canopy node that doesn't send CORS headers can still be used in dev by
  // pointing VITE_CANOPY_RPC_URL at /rpc and setting CANOPY_DEV_RPC_PROXY to
  // the node's origin. This is a dev-server-only convenience.
  const proxyTarget = env.CANOPY_DEV_RPC_PROXY;

  return {
    plugins: [react()],
    server: proxyTarget
      ? {
          proxy: {
            "/rpc": {
              target: proxyTarget,
              changeOrigin: true,
              rewrite: (path: string) => path.replace(/^\/rpc/, ""),
            },
          },
        }
      : undefined,
  };
});
