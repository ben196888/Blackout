import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Server } from 'boardgame.io/server';
import serve from 'koa-static';
import { GAME_NAME } from './constants';
import { BlackoutGame } from './game/game';
import { validateSeatCredentials } from './server/identity';
import { LoggingInMemory } from './server/storage';

const port = Number(process.env.PORT ?? 8080);
const dist = join(process.cwd(), 'dist');
const index = readFileSync(join(dist, 'index.html'), 'utf8');
const origins = [
  'https://pace-poc.fly.dev',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];
// Screenshot baselines need the same characters dealt every run. Real matches leave
// this unset and keep boardgame.io's time-based seed.
const seed = process.env.BLACKOUT_SEED;
const game = seed ? { ...BlackoutGame, seed } : BlackoutGame;
const server = Server({ games: [game], db: new LoggingInMemory(), origins, apiOrigins: origins });

server.router.post('/games/:name/:id/auth', async (ctx) => {
  ctx.set('Cache-Control', 'no-store');
  ctx.set('Vary', 'Authorization, X-Player-ID');

  const authorization = ctx.get('Authorization');
  const credentials = authorization.startsWith('Bearer ') ? authorization.slice('Bearer '.length) : undefined;
  const gameName = ctx.params.name ?? '';
  const matchID = ctx.params.id ?? '';
  const status = await validateSeatCredentials({
    auth: server.auth,
    credentials,
    db: server.db,
    gameName,
    matchID,
    playerID: ctx.get('X-Player-ID'),
  });

  if (gameName !== GAME_NAME || status === 'NOT_FOUND') {
    ctx.status = 404;
    ctx.body = { error: 'Match not found' };
    return;
  }
  if (status === 'INVALID') {
    ctx.status = 401;
    ctx.body = { error: 'Invalid seat credentials' };
    return;
  }
  ctx.status = 204;
});

server.app.use(async (ctx, next) => {
  if (ctx.path === '/health') {
    ctx.type = 'application/json';
    ctx.body = {
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      version: process.env.APP_VERSION ?? 'development',
    };
    return;
  }
  await next();
});

server.app.use(serve(dist));

server.app.use(async (ctx, next) => {
  if (
    ctx.method === 'GET' &&
    !ctx.path.startsWith('/games') &&
    !ctx.path.startsWith('/socket.io') &&
    ctx.accepts('html')
  ) {
    ctx.type = 'text/html';
    ctx.body = index;
    return;
  }
  await next();
});

void server.run(port, () => {
  console.log(JSON.stringify({ event: 'pace.server.ready', port }));
});
