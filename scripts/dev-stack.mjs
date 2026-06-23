import { createInterface } from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '..');
const recorderDir = path.join(rootDir, 'tiktoklive-recorder');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const brewCommand = process.platform === 'win32' ? null : 'brew';

const pythonCandidates = [process.env.PYTHON_BIN, 'python3.11', 'python3', 'python'].filter(Boolean);
const frontendPort = 4173;
const recorderPort = 8765;
const postgresHost = '127.0.0.1';
const postgresServiceCandidates = [
  process.env.DEV_STACK_POSTGRES_SERVICE,
  'postgresql@17',
  'postgresql',
].filter(Boolean);
const databaseUrl = process.env.DEV_STACK_DATABASE_URL
  ?? 'postgresql://ember:ember@127.0.0.1:5432/ember';

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readBrewServicesList() {
  if (!brewCommand) {
    return '';
  }

  const result = spawnSync(brewCommand, ['services', 'list'], { encoding: 'utf8' });
  return `${result.stdout ?? ''}${result.stderr ?? ''}`;
}

function detectStartedPostgresService() {
  const output = readBrewServicesList();
  for (const serviceName of postgresServiceCandidates) {
    const regex = new RegExp(`^\\s*${escapeRegex(serviceName)}\\s+started\\b`, 'm');
    if (regex.test(output)) {
      return serviceName;
    }
  }
  return null;
}

async function ensurePostgresService() {
  if (!brewCommand) {
    process.stdout.write('[dev] Homebrew no está disponible en este sistema. Se usará la base local configurada en DATABASE_URL.\n');
    return null;
  }

  const startedService = detectStartedPostgresService();
  if (startedService) {
    process.stdout.write(`[dev] Servicio PostgreSQL detectado como activo: ${startedService}\n`);
    return startedService;
  }

  let lastOutput = null;
  for (const serviceName of postgresServiceCandidates) {
    const result = spawnSync(brewCommand, ['services', 'start', serviceName], { encoding: 'utf8' });
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    if (result.status === 0 || /already started/i.test(output)) {
      process.stdout.write(`[dev] Servicio PostgreSQL solicitado: ${serviceName}\n`);
      if (output) {
        process.stdout.write(`[dev] ${output}\n`);
      }
      return serviceName;
    }
    lastOutput = output || `${serviceName} (sin salida)`;
  }

  process.stdout.write(
    '[dev] No pude iniciar un servicio PostgreSQL con Homebrew. Si ya está arriba, seguimos; si no, arráncalo antes de usar el stack.\n'
  );
  if (lastOutput) {
    process.stdout.write(`[dev] Último intento: ${lastOutput}\n`);
  }
  return null;
}

async function main() {
  const pythonBin = pickPythonBinary();
  const children = [];
  let shuttingDown = false;
  let postgresServiceName = null;

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
    process.stdout.write('\nCerrando frontend y backend...\n');
    stopAll('SIGINT', 0);
  });

  process.on('SIGTERM', () => {
    stopAll('SIGTERM', 0);
  });

  process.stdout.write('[dev] Preparando la base de datos local...\n');
  postgresServiceName = await ensurePostgresService();

  if (postgresServiceName) {
    process.stdout.write(`[dev] Base de datos lista: servicio Homebrew ${postgresServiceName} / ${postgresHost}:5432\n`);
  } else {
    process.stdout.write(`[dev] Base de datos esperada en ${postgresHost}:5432\n`);
  }

  process.stdout.write('[dev] Iniciando frontend y backend...\n');
  process.stdout.write(`[dev] Frontend: ${npmCommand} run dev -- --host 127.0.0.1 --port ${frontendPort} --strictPort\n`);
  process.stdout.write(`[dev] Backend: ${pythonBin} main.py\n`);

  const frontend = spawnProcess({
    name: 'frontend',
    command: npmCommand,
    args: ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(frontendPort), '--strictPort'],
    cwd: rootDir,
    onError: () => stopAll('SIGTERM', 1),
  });
  children.push(frontend);

  const recorder = spawnProcess({
    name: 'backend',
    command: pythonBin,
    args: ['main.py'],
    cwd: recorderDir,
    env: {
      PYTHONUNBUFFERED: '1',
      DATABASE_URL: databaseUrl,
      RECORDER_CONTROL_HOST: postgresHost,
      RECORDER_CONTROL_PORT: String(recorderPort),
    },
    onError: () => stopAll('SIGTERM', 1),
  });
  children.push(recorder);

  for (const [name, child] of [
    ['frontend', frontend],
    ['backend', recorder],
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

  process.stdout.write(`[dev] Cuando ambos estén arriba, abre http://127.0.0.1:${frontendPort}/\n`);
  process.stdout.write(`[dev] El backend quedará en http://127.0.0.1:${recorderPort}/\n`);
  process.stdout.write('[dev] Presiona Ctrl+C para detener frontend y backend.\n');
}

main().catch((error) => {
  process.stderr.write(`[dev] ${error.message}\n`);
  process.exitCode = 1;
});
