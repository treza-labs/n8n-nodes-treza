// `npm test`: start the mock Treza API on a free port, run every scenario
// against the built node, and exit non-zero if any of them fails.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));

const port = await new Promise((resolve) => {
	const server = net.createServer().listen(0, () => {
		const { port } = server.address();
		server.close(() => resolve(port));
	});
});
const callsLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'treza-n8n-')), 'calls.log');
fs.writeFileSync(callsLog, '');
const env = { ...process.env, PORT: String(port), CALLS_LOG: callsLog, TREZA_BASE_URL: `http://localhost:${port}` };

const mock = spawn(process.execPath, [path.join(dir, 'mock-treza.mjs')], { env, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((resolve) => mock.stdout.once('data', resolve));

const scenarios = spawn(process.execPath, [path.join(dir, 'scenarios.cjs')], { env, stdio: 'inherit' });
const code = await new Promise((resolve) => scenarios.on('exit', resolve));
mock.kill();
process.exit(code ?? 1);
