import type { MetadataRoute } from 'next'
import { CLIENT_CONFIG } from '@/lib/client-config'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${CLIENT_CONFIG.name} Driver`,
    short_name: CLIENT_CONFIG.shortName,
    description: `Driver route app for ${CLIENT_CONFIG.name}`,
    start_url: '/driver',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: CLIENT_CONFIG.primaryColor,
    icons: [
      {
        src: CLIENT_CONFIG.icon192,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: CLIENT_CONFIG.icon512,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
