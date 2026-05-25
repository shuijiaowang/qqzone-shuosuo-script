import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-vue', '@wxt-dev/i18n/module'],
  manifest: {
    permissions: ['storage', 'unlimitedStorage', 'tabs'],
    host_permissions: ['http://127.0.0.1:3840/*'],
    default_locale: 'zh_CN',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
  },
});
