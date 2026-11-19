import { build } from 'esbuild';
await build({
  entryPoints: ['backend/dist/main.js'],
  outfile: 'dist/server.cjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  sourcemap: true,
  external: [
    '*.node',
    'pg-native',
    'cpu-features',
    '@nestjs/microservices',
    '@nestjs/microservices/*',
    '@nestjs/websockets/*',
    'class-transformer',
    'class-validator',
  ],
  define: { 'process.env.NODE_ENV': '"production"' },
});
console.log('Standalone backend bundle ready.');
