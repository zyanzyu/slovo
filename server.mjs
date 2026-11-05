import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSlovoServer } from './server/http-server.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, 'dist');
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || '0.0.0.0';

const server = createSlovoServer({ distDir: dist });

server.listen(port, host, () => {
  console.log(`СЛОВО running at http://127.0.0.1:${port}`);
});
