import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Pachanga',
    loadComponent: () => import('./pages/home/home-page').then((m) => m.HomePage),
  },
  {
    path: 'nuevo',
    title: 'Nuevo torneo · Pachanga',
    loadComponent: () => import('./pages/setup/setup-page').then((m) => m.SetupPage),
  },
  {
    path: 't/:id/tv',
    title: 'Modo TV · Pachanga',
    loadComponent: () => import('./pages/tv/tv-page').then((m) => m.TvPage),
  },
  {
    path: 't/:id',
    title: 'Pachanga',
    loadComponent: () => import('./pages/shell/tournament-shell').then((m) => m.TournamentShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'partidos' },
      {
        path: 'ruleta',
        loadComponent: () => import('./pages/draw/draw-page').then((m) => m.DrawPage),
      },
      {
        path: 'partidos',
        loadComponent: () => import('./pages/matches/matches-page').then((m) => m.MatchesPage),
      },
      {
        path: 'tabla',
        loadComponent: () => import('./pages/standings/standings-page').then((m) => m.StandingsPage),
      },
      {
        path: 'cuadro',
        loadComponent: () => import('./pages/bracket/bracket-page').then((m) => m.BracketPage),
      },
      {
        path: 'goleadores',
        loadComponent: () => import('./pages/scorers/scorers-page').then((m) => m.ScorersPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
