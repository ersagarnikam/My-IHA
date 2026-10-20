// The public marketing site is the platform's home page; the portal is reached
// from its buttons and sends people back there when they leave.
// Override per environment with VITE_HOME_URL (e.g. a staging copy of the site).

export const HOME_URL = import.meta.env.VITE_HOME_URL || 'https://medicaltourismaustralia.com'

/** Host name shown in links, e.g. "medicaltourismaustralia.com". */
export const HOME_HOST = new URL(HOME_URL).host.replace(/^www\./, '')

/** Leaves the portal for the website (replace: true keeps the portal out of Back history). */
export function goHome(replace = false) {
  if (replace) window.location.replace(HOME_URL)
  else window.location.assign(HOME_URL)
}
