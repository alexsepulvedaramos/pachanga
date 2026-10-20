import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Tournament } from '../domain/types';
import { BACKEND } from '../config';
import {
  ConflictError,
  StoredTournament,
  TournamentRepository,
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
    if (error) {
      if (error.message.includes('WRONG_PIN')) throw new WrongPinError();
      if (error.message.includes('CONFLICT')) throw new ConflictError();
      throw new Error('No se ha podido guardar. Revisa la conexión.');
    }
    return { tournament, version: data as number };
  }

  async verifyPin(id: string, pin: string): Promise<boolean> {
    const { data, error } = await this.client.rpc('verify_tournament_pin', { p_id: id, p_pin: pin });
    if (error) throw new Error('No se ha podido comprobar el PIN. Revisa la conexión.');
    return data === true;
  }

  watch(id: string, onChange: (stored: StoredTournament) => void): () => void {
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
      .subscribe();
    return () => void this.client.removeChannel(channel);
  }
}
