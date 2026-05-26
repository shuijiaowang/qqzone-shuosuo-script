import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    permissions: ['storage', 'unlimitedStorage', 'tabs'],
    host_permissions: ['http://127.0.0.1:3840/*']
  },
});
