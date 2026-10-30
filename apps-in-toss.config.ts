import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'whoami',
  brand: { primaryColor: '#3169df' },
  permissions: [],
  webView: { bounces: false, pullToRefreshEnabled: false },
  webBundleDir: 'dist',
});
