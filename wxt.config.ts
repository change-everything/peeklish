import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'peeklish',
    description: 'Read English. Peek when needed. 读英文，需要时看一眼。',
    permissions: ['storage', 'scripting', 'activeTab', 'offscreen', 'sidePanel', 'tabs'],
    commands: {
      _execute_action: {
        suggested_key: { default: 'Alt+Shift+P' },
      },
      'quick-excerpt': {
        description: '摘录当前选中的文字',
        suggested_key: { default: 'Alt+Shift+E' },
      },
    },
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    incognito: 'not_allowed',
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    action: {
      default_title: 'peeklish',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
      },
    },
  },
});
