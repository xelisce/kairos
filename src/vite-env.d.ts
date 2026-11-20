/// <reference types="vite/client" />

// Build-time settings from .env.local (see .env.example). Both are optional: without them the
// app only uses the local database.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
