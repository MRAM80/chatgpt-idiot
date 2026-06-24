const name = process.env.NEXT_PUBLIC_CLIENT_NAME || 'SimpliiTrash'
const shortName = process.env.NEXT_PUBLIC_CLIENT_SHORT_NAME || 'ST'

export const CLIENT_CONFIG = {
  name,
  shortName,
  tagline: process.env.NEXT_PUBLIC_CLIENT_TAGLINE || '',
  logoUrl: process.env.NEXT_PUBLIC_CLIENT_LOGO_URL || null,
  primaryColor: process.env.NEXT_PUBLIC_CLIENT_PRIMARY_COLOR || '#0f172a',
  secondaryColor: process.env.NEXT_PUBLIC_CLIENT_SECONDARY_COLOR || '#0f172a',
  themeStorageKey: `${shortName.toLowerCase()}-theme`,
  swCacheName: `${shortName.toLowerCase()}-driver-v2`,
  emailPlaceholder: process.env.NEXT_PUBLIC_CLIENT_EMAIL_PLACEHOLDER || `you@${name.toLowerCase().replace(/\s+/g, '')}.com`,
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@simpliidash.ca',
}
