/**
 * Public backend settings. The publishable key is safe to ship: every write goes through
 * PIN-checked database functions. Leave both empty to run fully in the browser.
 */
export const BACKEND = {
  supabaseUrl: 'https://khzijeebbnejsqqpwkty.supabase.co',
  supabaseKey: 'sb_publishable_PZthppADtf8_HTTuH3RZfQ_O6TdJdK8',
};

export const hasBackend = () => !!BACKEND.supabaseUrl && !!BACKEND.supabaseKey;

/** Public half of the VAPID key pair used to sign push notifications (the private half is server-side). */
export const PUSH_PUBLIC_KEY =
  'BKyy_TUiOUQVvxOAx0u76irhiB5ZJSIlGPhMjknJPt2PUuytB7ique3cUx0L9K8ILuKqmFht684_wxKrI3KBqlQ';
