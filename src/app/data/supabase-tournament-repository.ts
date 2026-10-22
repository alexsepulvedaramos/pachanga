import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Tournament } from '../domain/types';
import { MatchResult } from '../domain/tournament';
import { BACKEND } from '../config';
import {
  ConflictError,
  PinLockedError,
  StoredTournament,
  TournamentRepository,
  NameTakenError,
  VoteTakenError,
  VotingClosedError,
  WrongPinError,
} from './tournament-repository';

interface TournamentRow {
  id: string;
  state: Tournament;
  version: number;
}

@Injectable()
export class SupabaseTournamentRepository extends TournamentRepository {
  private readonly client: SupabaseClient = createClient(BACKEND.supabaseUrl, BACKEND.supabaseKey, {
    auth: { persistSession: false },
  });

  async create(tournament: Tournament, pin: string): Promise<StoredTournament> {
    const { error } = await this.client.rpc('create_tournament', {
      p_id: tournament.id,
      p_name: tournament.name,
      p_state: tournament,
      p_pin: pin,
    });
    if (error) throw new Error('No se ha podido crear el torneo. Inténtalo otra vez.');
    return { tournament, version: 1 };
  }

  async load(id: string): Promise<StoredTournament | null> {
    const { data, error } = await this.client
      .from('tournaments')
      .select('id, state, version')
      .eq('id', id)
      .maybeSingle<TournamentRow>();
    if (error) throw new Error('No se ha podido cargar el torneo. Revisa la conexión.');
    return data ? { tournament: data.state, version: data.version } : null;
  }

  async save(tournament: Tournament, pin: string, expectedVersion: number): Promise<StoredTournament> {
    const { data, error } = await this.client.rpc('save_tournament', {
      p_id: tournament.id,
      p_state: tournament,
      p_pin: pin,
      p_expected_version: expectedVersion,
    });
    if (error) throw new Error('No se ha podido guardar. Revisa la conexión.');
    // Failures come back as negative codes so the server can record failed PIN attempts.
    const version = data as number;
    if (version === -1) throw new WrongPinError();
    if (version === -2) throw new ConflictError();
    if (version === -3) throw new PinLockedError();
    return { tournament, version };
  }

  async verifyPin(id: string, pin: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('verify_tournament_pin', { p_id: id, p_pin: pin });
    if (error) throw new Error('No se ha podido comprobar el PIN. Revisa la conexión.');
    if (data === null) throw new PinLockedError();
    return data === true;
  }

  async delete(id: string, pin: string): Promise<void> {
    const { data, error } = await this.client.rpc('delete_tournament', { p_id: id, p_pin: pin });
    if (error) throw new Error('No se ha podido borrar. Revisa la conexión.');
    if (data === -1) throw new WrongPinError();
    if (data === -3) throw new PinLockedError();
  }

  async claim(id: string, participantId: string, token: string): Promise<void> {
    const { data, error } = await this.client.rpc('claim_participant', {
      p_id: id,
      p_participant: participantId,
      p_token: token,
    });
    if (error) throw new Error('No se ha podido elegir el nombre. Revisa la conexión.');
    if (data === -6) throw new NameTakenError();
    if (data !== 1) throw new Error('Ese nombre no está en el torneo.');
  }

  async release(id: string, participantId: string, token: string, dropVote: boolean): Promise<void> {
    const { error } = await this.client.rpc('release_participant', {
      p_id: id,
      p_participant: participantId,
      p_token: token,
      p_drop_vote: dropVote,
    });
    if (error) throw new Error('No se ha podido cambiar de nombre. Revisa la conexión.');
  }

  async adminRelease(id: string, pin: string, participantId: string): Promise<void> {
    const { data, error } = await this.client.rpc('admin_release_participant', {
      p_id: id,
      p_pin: pin,
      p_participant: participantId,
    });
    if (error) throw new Error('No se ha podido liberar el nombre. Revisa la conexión.');
    this.checkAdminCode(data as number);
  }

  async startMatch(id: string, participantId: string, token: string, matchId: string): Promise<void> {
    await this.playerAction({ action: 'start', tournament_id: id, participant_id: participantId, token, match_id: matchId }, 'No se ha podido empezar el partido. Revisa la conexión.');
  }

  async reportResult(id: string, participantId: string, token: string, matchId: string, result: MatchResult): Promise<void> {
    await this.playerAction({ action: 'result', tournament_id: id, participant_id: participantId, token, match_id: matchId, result }, 'No se ha podido guardar el resultado. Revisa la conexión.');
  }

  private async playerAction(body: Record<string, unknown>, fallback: string): Promise<void> {
    const { error } = await this.client.functions.invoke('submit-result', { body });
    if (!error) return;
    // The function explains refusals (not your turn, not playing, already in) in its body.
    const reply = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(reply?.error ?? fallback);
  }

  async castVote(id: string, voterId: string, picks: string[], token: string): Promise<void> {
    const { data, error } = await this.client.rpc('cast_ballon_dor_vote', {
      p_id: id,
      p_voter: voterId,
      p_picks: picks,
      p_token: token,
    });
    if (error) throw new Error('No se ha podido votar. Revisa la conexión.');
    if (data === -4) throw new VotingClosedError();
    if (data === -5) throw new Error('El voto no es válido: elige a tres jugadores distintos.');
    if (data === -6) throw new VoteTakenError();
  }

  async closeVoting(id: string, pin: string): Promise<void> {
    const { data, error } = await this.client.rpc('close_ballon_dor', { p_id: id, p_pin: pin });
    if (error) throw new Error('No se ha podido cerrar la votación. Revisa la conexión.');
    this.checkAdminCode(data as number);
  }

  async resetVote(id: string, pin: string, voterId: string): Promise<void> {
    const { data, error } = await this.client.rpc('reset_ballon_dor_vote', {
      p_id: id,
      p_pin: pin,
      p_voter: voterId,
    });
    if (error) throw new Error('No se ha podido borrar el voto. Revisa la conexión.');
    this.checkAdminCode(data as number);
  }

  private checkAdminCode(code: number): void {
    if (code === -1) throw new WrongPinError();
    if (code === -3) throw new PinLockedError();
    if (code === -4) throw new VotingClosedError();
  }

  async subscribePush(id: string, participantId: string, sub: PushSubscriptionJSON): Promise<void> {
    const { error } = await this.client.rpc('subscribe_push', {
      p_tournament_id: id,
      p_participant_id: participantId,
      p_endpoint: sub.endpoint,
      p_p256dh: sub.keys?.['p256dh'],
      p_auth: sub.keys?.['auth'],
    });
    if (error) throw new Error('No se han podido activar los avisos. Inténtalo otra vez.');
  }

  async unsubscribePush(endpoint: string): Promise<void> {
    await this.client.rpc('unsubscribe_push', { p_endpoint: endpoint });
  }

  watch(
    id: string,
    onChange: (stored: StoredTournament) => void,
    onReconnect?: () => void,
  ): () => void {
    const channel = this.client
      .channel(`tournament:${id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tournaments', filter: `id=eq.${id}` },
        (payload) => {
          const row = payload.new as TournamentRow;
          onChange({ tournament: row.state, version: row.version });
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') onReconnect?.();
      });
    return () => void this.client.removeChannel(channel);
  }
}
