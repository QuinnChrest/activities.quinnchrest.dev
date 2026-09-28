// Branding and site-wide settings. Change the name here; nothing else hardcodes it.

export const site = {
  name: 'Quinn in Motion',
  tagline: 'Every ride and walk, on one map.',
  /** Link back to the main site. */
  homeUrl: 'https://quinnchrest.dev',
  /** IANA time zone used to bucket activities into local days (build scripts use this too). */
  timeZone: 'America/Chicago',
  colors: {
    bike: '#3fd8ff',
    walk: '#ff5fb8',
  },
  /** Minimum ride distance (meters) for the "fastest average speed" record. */
  fastestRideMinDistance: 10_000,
} as const
