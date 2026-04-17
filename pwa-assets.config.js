import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

export default defineConfig({
  headLinkOptions: {
    preset: '2023',
  },
  preset: {
    ...minimal2023Preset,
    // Output directory relative to the image source
    // icons land in public/icons/
  },
  images: ['public/retroinator-icon.svg'],
})
