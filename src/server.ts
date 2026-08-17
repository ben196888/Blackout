import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Server } from 'boardgame.io/server';
import serve from 'koa-static';
import { BlackoutGame } from './game/game';
import { LoggingInMemory } from './server/storage';

const port = Number(process.env.PORT ?? 8080);
const dist = join(process.cwd(), 'dist');
const index = readFileSync(join(dist, 'index.html'), 'utf8');
const origins = [
  'https://pace-poc.fly.dev',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
];
const server = Server({ games: [BlackoutGame], db: new LoggingInMemory(), origins, apiOrigins: origins });

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
