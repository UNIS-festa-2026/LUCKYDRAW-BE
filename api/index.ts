import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';

let cachedServer: express.Express | undefined;

async function getServer() {
  if (cachedServer) {
    return cachedServer;
  }

  const server = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
    logger: ['error', 'warn', 'log'],
  });
  configureApp(app);
  await app.init();
  cachedServer = server;
  return server;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const server = await getServer();
  return server(req, res);
}
