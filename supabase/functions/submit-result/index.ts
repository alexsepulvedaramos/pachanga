// A player starts the match that's up, or enters the result of the one they're playing, from their
// phone, without the admin PIN. The phone proves the name is its own with the token it took the
// name with; the change goes through the app's own rules (domain.js) and is saved like any other,
// retrying if someone saved in between.

import postgres from 'npm:postgres@3.4.5';
import { playerStartMatch, reportResult } from './domain.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 1 });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const reply = (status: number, body: Record<string, unknown>) => Response.json(body, { status, headers: cors });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return reply(405, { error: 'Método no permitido.' });

  let input: Record<string, unknown>;
  try {
    input = await req.json();
  } catch {
    return reply(400, { error: 'Petición no válida.' });
  }
  const { action = 'result', tournament_id: id, participant_id: who, token, match_id: matchId, result } = input;
  if (
    (action !== 'result' && action !== 'start') ||
    typeof id !== 'string' ||
    typeof who !== 'string' ||
    typeof token !== 'string' ||
    token.length < 16 ||
    typeof matchId !== 'string' ||
    (action === 'result' && (!result || typeof result !== 'object'))
  ) {
    return reply(400, { error: 'Petición no válida.' });
  }

  const [claim] = await sql`
    select 1 from public.participant_claims
    where tournament_id = ${id} and participant_id = ${who} and token_hash = ${await sha256(token)}`;
  if (!claim) return reply(403, { error: 'Ese nombre no es de este móvil.' });

  for (let attempt = 0; attempt < 3; attempt++) {
    const [row] = await sql`select state, version from public.tournaments where id = ${id}`;
    if (!row) return reply(404, { error: 'No existe ningún torneo con ese código.' });
    let next: unknown;
    try {
      next =
        action === 'start'
          ? playerStartMatch(row.state, who, matchId, Math.random)
          : reportResult(row.state, who, matchId, result);
    } catch (error) {
      return reply(409, { error: (error as Error).message });
    }
    const saved = await sql`
      update public.tournaments
      set state = ${sql.json(next as Record<string, unknown>)}, version = version + 1, updated_at = now()
      where id = ${id} and version = ${row.version}
      returning version`;
    if (saved.length) return reply(200, { version: saved[0].version });
  }
  return reply(409, { error: 'Alguien ha cambiado el torneo a la vez. Prueba otra vez.' });
});
