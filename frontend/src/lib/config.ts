// Single source of truth for branding + API base URL. Every place branding
// appears (page title, header logo, footer) should import APP_NAME from here
// rather than hardcoding "Hirepool".
export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Hirepool'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || ''
