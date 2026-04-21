/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: 'com.hivemind.os',
  productName: 'HiveMind OS',
  directories: {
    output: 'release',
  },
  protocols: [
    {
      name: 'HiveMind OS',
      schemes: ['hivemind-os'],
    },
  ],
  files: [
    'dist/**/*',
    'electron/**/*',
  ],
  win: {
    target: ['nsis'],
  },
  mac: {
    target: ['dmg'],
    category: 'public.app-category.developer-tools',
    extendInfo: {
      CFBundleURLTypes: [
        {
          CFBundleURLName: 'com.hivemind.os',
          CFBundleURLSchemes: ['hivemind-os'],
        },
      ],
    },
  },
  linux: {
    target: ['AppImage'],
  },
};
