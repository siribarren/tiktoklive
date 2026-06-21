import { createInterface } from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const recorderDir = path.join(rootDir, 'tiktoklive-recorder');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const pythonCandidates = [
  process.env.PYTHON_BIN,
  'python3.11',
  'python3',
  'python',
].filter(Boolean);

function parsePythonVersion(output) {
  const match = output.match(/Python\s+(\d+)\.(\d+)\.(\d+)/i);
  if (!match) {
    return null;
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isSupportedPython(version) {
  if (!version) {
    return false;
  }

  return version.major > 3 || (version.major === 3 && version.minor >= 10);
}

function pickPythonBinary() {
  const tried = [];

  for (const candidate of pythonCandidates) {
    const result = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    const version = parsePythonVersion(output);
    tried.push(output || `${candidate} (unavailable)`);

    if (result.error || result.status !== 0 || !isSupportedPython(version)) {
      continue;
    }

    return candidate;
  }

  throw new Error(
    [
      'No se encontró un Python compatible para el recorder.',
      'Necesitas Python 3.10 o superior, idealmente `python3.11`.',
      `Intentos: ${tried.join(' | ') || 'ninguno'}.`,
    ].join(' ')
  );
}

function prefixStream(stream, label, write = process.stdout.write.bind(process.stdout)) {
  const readline = createInterface({ input: stream });
  readline.on('line', (line) => {
    write(`[${label}] ${line}\n`);
  });
  return readline;
}

function spawnProcess({ name, command, args, cwd, env, onError }) {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const stdout = child.stdout ? prefixStream(child.stdout, name) : null;
  const stderr = child.stderr ? prefixStream(child.stderr, name, process.stderr.write.bind(process.stderr)) : null;

  child.once('exit', () => {
    stdout?.close();
    stderr?.close();
  });

  child.once('error', (error) => {
    process.stderr.write(`[${name}] No se pudo iniciar: ${error.message}\n`);
    process.exitCode = 1;
    onError?.(error);
  });

  return child;
}

async function main() {
  const pythonBin = pickPythonBinary();
  const children = [];
  let shuttingDown = false;

  const stopAll = (signal = 'SIGTERM', exitCode = 0) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    process.exitCode = exitCode;

    for (const child of children) {
      if (!child.killed) {
        child.kill(signal);
      }
    }
  };

  process.on('SIGINT', () => {
    process.stdout.write('\nCerrando frontend y recorder...\n');
    stopAll('SIGINT', 0);
  });

  process.on('SIGTERM', () => {
    stopAll('SIGTERM', 0);
  });

  process.stdout.write('[dev] Iniciando frontend y recorder...\n');
  process.stdout.write(`[dev] Frontend: ${npmCommand} run dev\n`);
  process.stdout.write(`[dev] Recorder: ${pythonBin} main.py\n`);

  const frontend = spawnProcess({
    name: 'frontend',
    command: npmCommand,
    // Bind to all interfaces and keep the frontend on the expected port.
    args: ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '4173', '--strictPort'],
    cwd: rootDir,
    onError: () => stopAll('SIGTERM', 1),
  });
  children.push(frontend);

  const recorder = spawnProcess({
    name: 'recorder',
    command: pythonBin,
    args: ['main.py'],
    cwd: recorderDir,
    env: {
      PYTHONUNBUFFERED: '1',
    },
    onError: () => stopAll('SIGTERM', 1),
  });
  children.push(recorder);

  for (const [name, child] of [
    ['frontend', frontend],
    ['recorder', recorder],
  ]) {
    child.once('exit', (code, signal) => {
      if (shuttingDown) {
        return;
      }

      const reason = signal ? `se detuvo por ${signal}` : `salió con código ${code}`;
      process.stderr.write(`[${name}] ${reason}. Apagando el otro proceso...\n`);
      stopAll('SIGTERM', code && code !== 0 ? code : 1);
    });
  }

  const readyLines = [
    '[dev] Cuando ambos estén arriba, el frontend quedará en http://127.0.0.1:4173/',
    '[dev] y la API del recorder en http://127.0.0.1:8765/',
    '[dev] Presiona Ctrl+C para detenerlos.',
  ];
  for (const line of readyLines) {
    process.stdout.write(`${line}\n`);
  }
}

main().catch((error) => {
  process.stderr.write(`[dev] ${error.message}\n`);
  process.exitCode = 1;
});
