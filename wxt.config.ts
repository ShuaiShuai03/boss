import ui from '@nuxt/ui/vite'
import vueJsx from '@vitejs/plugin-vue-jsx'
import { transformWithEsbuild } from 'vite'
import tailwindShadowDOM from 'vite-plugin-tailwind-shadowdom'
import { defineConfig } from 'wxt'

import { version } from './package.json'

const matches = ['*://zhipin.com/*', '*://*.zhipin.com/*']

function shouldScanAutoImportFile(file: string) {
  return !file.replaceAll('\\', '/').endsWith('utils/request.ts')
}

export default defineConfig({
  srcDir: 'src',
  outDirTemplate: '{{browser}}-mv{{manifestVersion}}',
  modules: ['@wxt-dev/module-vue'],
  imports: {
    dirsScanOptions: {
      fileFilter: shouldScanAutoImportFile,
    },
  },

  vite: (env) => ({
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __BOSS_HELPER_TARGET_BROWSER__: JSON.stringify(env.browser),
    },
    ssr: {
      noExternal: [
        '@webext-core/storage',
        '@webext-core/messaging',
        '@webext-core/proxy-service',
        '@nuxt/ui',
      ],
    },
    plugins: [
      vueJsx(),
      ui({
        // autoImport: false,
        // components: false,
        colorMode: false,
        router: false,
        prose: false,
        ui: {
          colors: {
            primary: 'teal',
            neutral: 'gray',
            warning: 'orange',
            success: 'emerald',
            error: 'rose',
          },
          badge: {
            defaultVariants: {
              color: 'neutral',
              variant: 'subtle',
            },
          },
          alert: {
            slots: {
              root: 'px-4 py-2',
            },
            defaultVariants: {
              orientation: 'horizontal',
            },
          },
          button: {
            slots: {
              base: 'cursor-pointer',
            },
          },
          tabs: {
            slots: {
              trigger: 'cursor-pointer',
            },
          },
          link: {
            base: 'no-underline hover:underline',
          },
          formField: {
            slots: {
              // container: 'flex flex-1',
              // root: 'justify-start items-center',
            },
            defaultVariants: {
              orientation: 'horizontal',
            },
          },
          modal: {
            slots: {
              overlay: 'z-200',
              content: 'z-220',
              footer: 'justify-end',
            },
          },
          chatMessage: {
            variants: {
              side: {
                right: {
                  container: 'flex-row-reverse justify-start',
                },
              },
            },
          },
          slideover: {
            slots: {
              content: 'z-9999',
            },
          },
        },
      }),
      tailwindShadowDOM(),
    ],
  }),
  dev: {},
  manifest: {
    default_locale: 'zh_CN',
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    permissions: ['storage', 'notifications', 'alarms'],
    web_accessible_resources: [
      {
        resources: ['boss.js', 'chat-socket-main-world.js', 'chunks/*'],
        matches,
      },
    ],
    host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*', 'http://[::1]/*'],
    key: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAxCHedeutoVPRmAkHsKoev5NdPRNcre8U1Z7a1MbceU7BQRIkMhiIApkBpvoTW30dcUQ/V3UOB6v4Crvkr40Hjr8u1uygcWynl12/+gIcNriIKgZh+udWCkKCFHs5pFEdoXUaQqym+eEBkJCo5HwgxYkxXA94/a2Vtnd5u7Mk0nWyk40qx1wxATYEi10C5L82U32F6KgvIY7YqhtFaM9N2utW4rlbtMgeEOEANG6fo4IBhEM/+n5kbch5K2KAH70fMKUq9aOj43b3gTM4mT90tF1jfMRgLW26d6zfUhMQBG2SqQSc6AoN25r+Q5D79OcezUE1S8iBkzb1MM2GfkFxJQIDAQAB',
    browser_specific_settings: {
      gecko: {
        id: '{1b66669d-c871-43f3-8c0c-d8a1c0566071}',
        strict_min_version: '109.0',
      },
    },
  },
  webExt: {
    disabled: true,
  },
  hooks: {
    'vite:build:extendConfig'(entrypoints, viteConfig) {
      const buildsBoss = entrypoints.some(
        (entrypoint) => entrypoint.type === 'unlisted-script' && entrypoint.name === 'boss',
      )
      const buildsChrome =
        viteConfig.define?.__BOSS_HELPER_TARGET_BROWSER__ === JSON.stringify('chrome')
      if (!buildsBoss || !buildsChrome || !viteConfig.build?.lib) return

      viteConfig.build.lib.formats = ['es']
      viteConfig.build.minify = 'esbuild'
      viteConfig.plugins ??= []
      viteConfig.plugins.push({
        name: 'boss-helper:minify-chrome-main-world-esm',
        enforce: 'post',
        async renderChunk(code, chunk, outputOptions) {
          if (outputOptions.format !== 'es') return null
          return transformWithEsbuild(code, chunk.fileName, {
            format: 'esm',
            minify: true,
            sourcemap: false,
            target: 'es2022',
          })
        },
      })
      viteConfig.build.rollupOptions ??= {}
      const output = viteConfig.build.rollupOptions.output
      if (Array.isArray(output)) {
        throw new Error('BossHelper expects a single Rollup output configuration')
      }
      viteConfig.build.rollupOptions.output = {
        ...output,
        chunkFileNames: 'chunks/boss-[name]-[hash].js',
      }
    },
  },
  // hooks: {
  //   'build:manifestGenerated': (wxt, manifest) => {
  //     manifest.content_scripts ??= []
  //     manifest.content_scripts.push({
  //       // Build extension once to see where your CSS get's written to
  //       css: ['/assets/main-world.css'],
  //       matches,
  //     })
  //   },
  // },
})
