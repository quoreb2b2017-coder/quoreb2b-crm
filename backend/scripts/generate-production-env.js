const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function sanitizeForProduction(key, value) {
  if (key === 'APP_NAME') {
    return 'QuoreB2B CRM API'.replace(/\s+/g, '-');
  }
  if (key.startsWith('JWT_') && /\s/.test(value)) {
    return value.replace(/\s+/g, '');
  }
  return value;
}

function quote(value) {
  // Docker --env-file passes double quotes literally; keep values unquoted.
  return value;
}

function loadEnv(filePath) {
  return Object.fromEntries(
    fs
      .readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      }),
  );
}

const env = loadEnv(path.join(root, '.env'));
Object.assign(env, {
  NODE_ENV: 'production',
  APP_URL: 'http://13.232.248.18',
  CORS_ORIGINS: 'http://13.232.248.18,http://localhost:3000',
  SOCKET_CORS_ORIGINS: 'http://13.232.248.18,http://localhost:3000',
  REDIS_HOST: '127.0.0.1',
  LOG_LEVEL: 'info',
  SENTRY_ENVIRONMENT: 'production',
});

const output = fs
  .readFileSync(path.join(root, '.env.production.example'), 'utf8')
  .split(/\r?\n/)
  .map((line) => {
    if (!line.trim() || line.trim().startsWith('#') || !line.includes('=')) {
      return line;
    }
    const key = line.split('=')[0].trim();
    return env[key] !== undefined ? `${key}=${quote(sanitizeForProduction(key, env[key]))}` : line;
  })
  .join('\n');

const outPath = path.join(root, '.env.production.generated');
fs.writeFileSync(outPath, `${output}\n`, 'utf8');
console.log(`Wrote ${outPath}`);
