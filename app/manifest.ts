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
        src: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
