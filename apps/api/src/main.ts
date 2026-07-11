import { createApi } from './bootstrap';

async function bootstrap() {
  const app = await createApi();
  const port = Number.parseInt(process.env.PORT ?? '3001', 10);
  await app.listen(port, '0.0.0.0');
  console.log(`API running on http://localhost:${port}`);
  console.log(`tRPC endpoint: http://localhost:${port}/trpc`);
}

bootstrap().catch((error: unknown) => {
  console.error('API startup failed:', error);
  process.exitCode = 1;
});
