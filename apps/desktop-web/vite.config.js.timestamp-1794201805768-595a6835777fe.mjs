// vite.config.js
import { defineConfig, loadEnv } from "file:///C:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/node_modules/vite/dist/node/index.js";
import react from "file:///C:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///C:/Users/asus/Desktop/mcq/mcq-platform/apps/desktop-web/node_modules/@tailwindcss/vite/dist/index.mjs";
var vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiUrl = env.VITE_API_URL;
  const port = Number(env.VITE_DEV_PORT);
  if (!apiUrl) throw new Error("VITE_API_URL is required");
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("VITE_DEV_PORT must be an integer from 1 to 65535");
  }
  const proxyTarget = new URL(apiUrl).origin;
  return {
    plugins: [react(), tailwindcss()],
    // These are shared by lazy Quiz/Results routes. Discover them before route
    // navigation so dev optimization does not invalidate an in-flight import.
    optimizeDeps: { include: ["react-markdown", "remark-math", "rehype-katex"] },
    server: {
      port,
      proxy: {
        "/api": { target: proxyTarget, changeOrigin: true },
        "/uploads": { target: proxyTarget, changeOrigin: true },
        "/media": { target: proxyTarget, changeOrigin: true },
        "/socket.io": { target: proxyTarget, ws: true }
      }
    }
  };
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxhc3VzXFxcXERlc2t0b3BcXFxcbWNxXFxcXG1jcS1wbGF0Zm9ybVxcXFxhcHBzXFxcXGRlc2t0b3Atd2ViXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxhc3VzXFxcXERlc2t0b3BcXFxcbWNxXFxcXG1jcS1wbGF0Zm9ybVxcXFxhcHBzXFxcXGRlc2t0b3Atd2ViXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9DOi9Vc2Vycy9hc3VzL0Rlc2t0b3AvbWNxL21jcS1wbGF0Zm9ybS9hcHBzL2Rlc2t0b3Atd2ViL3ZpdGUuY29uZmlnLmpzXCI7aW1wb3J0IHsgZGVmaW5lQ29uZmlnLCBsb2FkRW52IH0gZnJvbSAndml0ZSc7XG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3QnO1xuaW1wb3J0IHRhaWx3aW5kY3NzIGZyb20gJ0B0YWlsd2luZGNzcy92aXRlJztcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKCh7IG1vZGUgfSkgPT4ge1xuICBjb25zdCBlbnYgPSBsb2FkRW52KG1vZGUsIHByb2Nlc3MuY3dkKCksICcnKTtcbiAgY29uc3QgYXBpVXJsID0gZW52LlZJVEVfQVBJX1VSTDtcbiAgY29uc3QgcG9ydCA9IE51bWJlcihlbnYuVklURV9ERVZfUE9SVCk7XG4gIGlmICghYXBpVXJsKSB0aHJvdyBuZXcgRXJyb3IoJ1ZJVEVfQVBJX1VSTCBpcyByZXF1aXJlZCcpO1xuICBpZiAoIU51bWJlci5pc0ludGVnZXIocG9ydCkgfHwgcG9ydCA8IDEgfHwgcG9ydCA+IDY1NTM1KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdWSVRFX0RFVl9QT1JUIG11c3QgYmUgYW4gaW50ZWdlciBmcm9tIDEgdG8gNjU1MzUnKTtcbiAgfVxuXG4gIGNvbnN0IHByb3h5VGFyZ2V0ID0gbmV3IFVSTChhcGlVcmwpLm9yaWdpbjtcbiAgcmV0dXJuIHtcbiAgICBwbHVnaW5zOiBbcmVhY3QoKSwgdGFpbHdpbmRjc3MoKV0sXG4gICAgLy8gVGhlc2UgYXJlIHNoYXJlZCBieSBsYXp5IFF1aXovUmVzdWx0cyByb3V0ZXMuIERpc2NvdmVyIHRoZW0gYmVmb3JlIHJvdXRlXG4gICAgLy8gbmF2aWdhdGlvbiBzbyBkZXYgb3B0aW1pemF0aW9uIGRvZXMgbm90IGludmFsaWRhdGUgYW4gaW4tZmxpZ2h0IGltcG9ydC5cbiAgICBvcHRpbWl6ZURlcHM6IHsgaW5jbHVkZTogWydyZWFjdC1tYXJrZG93bicsICdyZW1hcmstbWF0aCcsICdyZWh5cGUta2F0ZXgnXSB9LFxuICAgIHNlcnZlcjoge1xuICAgICAgcG9ydCxcbiAgICAgIHByb3h5OiB7XG4gICAgICAgICcvYXBpJzogeyB0YXJnZXQ6IHByb3h5VGFyZ2V0LCBjaGFuZ2VPcmlnaW46IHRydWUgfSxcbiAgICAgICAgJy91cGxvYWRzJzogeyB0YXJnZXQ6IHByb3h5VGFyZ2V0LCBjaGFuZ2VPcmlnaW46IHRydWUgfSxcbiAgICAgICAgJy9tZWRpYSc6IHsgdGFyZ2V0OiBwcm94eVRhcmdldCwgY2hhbmdlT3JpZ2luOiB0cnVlIH0sXG4gICAgICAgICcvc29ja2V0LmlvJzogeyB0YXJnZXQ6IHByb3h5VGFyZ2V0LCB3czogdHJ1ZSB9LFxuICAgICAgfSxcbiAgICB9LFxuICB9O1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXVXLFNBQVMsY0FBYyxlQUFlO0FBQzdZLE9BQU8sV0FBVztBQUNsQixPQUFPLGlCQUFpQjtBQUV4QixJQUFPLHNCQUFRLGFBQWEsQ0FBQyxFQUFFLEtBQUssTUFBTTtBQUN4QyxRQUFNLE1BQU0sUUFBUSxNQUFNLFFBQVEsSUFBSSxHQUFHLEVBQUU7QUFDM0MsUUFBTSxTQUFTLElBQUk7QUFDbkIsUUFBTSxPQUFPLE9BQU8sSUFBSSxhQUFhO0FBQ3JDLE1BQUksQ0FBQyxPQUFRLE9BQU0sSUFBSSxNQUFNLDBCQUEwQjtBQUN2RCxNQUFJLENBQUMsT0FBTyxVQUFVLElBQUksS0FBSyxPQUFPLEtBQUssT0FBTyxPQUFPO0FBQ3ZELFVBQU0sSUFBSSxNQUFNLGtEQUFrRDtBQUFBLEVBQ3BFO0FBRUEsUUFBTSxjQUFjLElBQUksSUFBSSxNQUFNLEVBQUU7QUFDcEMsU0FBTztBQUFBLElBQ0wsU0FBUyxDQUFDLE1BQU0sR0FBRyxZQUFZLENBQUM7QUFBQTtBQUFBO0FBQUEsSUFHaEMsY0FBYyxFQUFFLFNBQVMsQ0FBQyxrQkFBa0IsZUFBZSxjQUFjLEVBQUU7QUFBQSxJQUMzRSxRQUFRO0FBQUEsTUFDTjtBQUFBLE1BQ0EsT0FBTztBQUFBLFFBQ0wsUUFBUSxFQUFFLFFBQVEsYUFBYSxjQUFjLEtBQUs7QUFBQSxRQUNsRCxZQUFZLEVBQUUsUUFBUSxhQUFhLGNBQWMsS0FBSztBQUFBLFFBQ3RELFVBQVUsRUFBRSxRQUFRLGFBQWEsY0FBYyxLQUFLO0FBQUEsUUFDcEQsY0FBYyxFQUFFLFFBQVEsYUFBYSxJQUFJLEtBQUs7QUFBQSxNQUNoRDtBQUFBLElBQ0Y7QUFBQSxFQUNGO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
