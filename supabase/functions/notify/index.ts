// Sends push notifications after a tournament changes. Called by a database trigger with a shared
// secret; works out who to notify with the app's own rules (domain.js) and records every
// notification sent so nobody gets the same one twice.

import postgres from 'npm:postgres@3.4.5';
import webpush from 'npm:web-push@3.6.7';
import { buildMessages } from './domain.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });

Deno.serve(async (req) => {
  const rows = await sql`select key, value from private.settings`;
  const settings = Object.fromEntries(rows.map((r) => [r.key, r.value])) as Record<string, string>;
  if (!settings.notify_secret || req.headers.get('x-notify-secret') !== settings.notify_secret) {
    return new Response('Forbidden', { status: 403 });
  }

  const { tournament_id: id } = await req.json();
  const [row] = await sql`select state from public.tournaments where id = ${id}`;
  if (!row) return new Response('Not found', { status: 404 });

  webpush.setVapidDetails(settings.vapid_subject, settings.vapid_public, settings.vapid_private);
  const url = `/t/${id}/partidos`;
  let sent = 0;

  for (const message of buildMessages(row.state)) {
    for (const participantId of message.participantIds) {
      const subs = await sql`
        select endpoint, p256dh, auth from public.push_subscriptions
        where tournament_id = ${id} and participant_id = ${participantId}`;
      if (subs.length === 0) continue;

      const key = `${message.key}:${participantId}`;
      const fresh = await sql`
        insert into private.push_sent (tournament_id, key) values (${id}, ${key})
        on conflict do nothing returning key`;
      if (fresh.length === 0) continue;

      // Payload in the format Angular's service worker shows and opens on click.
      const payload = JSON.stringify({
        notification: {
          title: message.title,
          body: message.body,
          icon: '/icons/icon-192x192.png',
          badge: '/icons/icon-96x96.png',
          tag: message.key,
          renotify: true,
          vibrate: [200, 100, 200],
          data: { onActionClick: { default: { operation: 'navigateLastFocusedOrOpen', url } } },
        },
      });

      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
            { TTL: 600 },
          );
          sent++;
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode;
          // The browser dropped the subscription: forget it.
          if (status === 404 || status === 410) {
            await sql`delete from public.push_subscriptions where endpoint = ${sub.endpoint}`;
          } else {
            console.error('push failed', status, (error as Error).message);
          }
        }
      }
    }
  }
  return Response.json({ sent });
});
