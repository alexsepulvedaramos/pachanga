/**
 * Public backend settings. The publishable key is safe to ship: every write goes through
 * PIN-checked database functions. Leave both empty to run fully in the browser.
 */
export const BACKEND = {
  supabaseUrl: '',
  supabaseKey: '',
};

export const hasBackend = () => !!BACKEND.supabaseUrl && !!BACKEND.supabaseKey;
