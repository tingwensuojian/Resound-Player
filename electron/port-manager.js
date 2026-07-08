import net from 'node:net';

/**
 * Check if a given port is available on 127.0.0.1
 */
export async function isPortAvailable(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => {
        tester.close(() => resolve(true));
      })
      .listen(port, host);
  });
}

/**
 * Find the first available port starting from basePort.
 */
export async function pickPort(basePort, maxTries = 20) {
  for (let i = 0; i <= maxTries; i += 1) {
    const port = basePort + i;
    const ok = await isPortAvailable(port);
    if (ok) return port;
  }
  throw new Error(`No available port from ${basePort} to ${basePort + maxTries}`);
}

/**
 * Default preferred port bases.
 * Vite needs a known port for wait-on, so it stays at 5173.
 * Backend services shift if occupied.
 */
const DEFAULT_PORTS = {
  vite: 5173,
  api: 38761,
  unblockProxy: 38762,
  unblockMatch: 38763,
};

/**
 * Resolve all 4 service ports, guaranteeing no conflicts among them.
 *
 * Strategy:
 * 1. Try each preferred port. If taken, auto-increment within maxTries.
 * 2. After initial resolution, check for duplicates and re-resolve any duplicates.
 * 3. Return stable port map.
 *
 * @param {object} [preferred]  Override preferred ports.
 * @param {number} [maxTries=20]  Max offset from each base port.
 * @returns {Promise<{vite:number, api:number, unblockProxy:number, unblockMatch:number, >}
 */
export async function resolveServicePorts(preferred = {}, maxTries = 20) {
  const bases = { ...DEFAULT_PORTS, ...preferred };

  // Resolve each port independently
  const resolved = {};
  const usedPorts = new Set();

  const resolveOne = async (name, base) => {
    for (let i = 0; i <= maxTries; i++) {
      const candidate = base + i;
      if (usedPorts.has(candidate)) continue;
      const available = await isPortAvailable(candidate);
      if (available) {
        usedPorts.add(candidate);
        resolved[name] = candidate;
        return candidate;
      }
    }
    throw new Error(`Cannot resolve port for ${name} from base ${base}`);
  };

  // Resolve vite first (needs to be known for wait-on)
  await resolveOne('vite', bases.vite);
  // Then resolve backend services
  await resolveOne('api', bases.api);
  await resolveOne('unblockProxy', bases.unblockProxy);
  await resolveOne('unblockMatch', bases.unblockMatch);

  return {
    vite: resolved.vite,
    api: resolved.api,
    unblockProxy: resolved.unblockProxy,
    unblockMatch: resolved.unblockMatch,
      };
}