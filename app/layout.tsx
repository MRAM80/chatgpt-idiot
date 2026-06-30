import './globals.css'
import type { ReactNode } from 'react'
import { CLIENT_CONFIG } from '@/lib/client-config'
import ThemeWatcher from '@/components/ThemeWatcher'

export default function RootLayout({ children }: { children: ReactNode }) {
  const key = CLIENT_CONFIG.themeStorageKey
  const primary = CLIENT_CONFIG.primaryColor
  const secondary = CLIENT_CONFIG.secondaryColor

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var stored = localStorage.getItem('${key}');
                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (stored === 'dark' || (!stored && prefersDark)) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch(e) {}
            `,
          }}
        />
      </head>
      <body
        style={{
          ['--brand-primary' as string]: primary,
          ['--brand-secondary' as string]: secondary,
        }}
      >
        <ThemeWatcher />
        {children}
      </body>
    </html>
  )
}
