// ============================================================
// Secret Manager — Replit stub (env-var only, no GCP dependency)
// ============================================================

let secretCache = {};

/**
 * No-op on Replit. Cloud Run uses GCP Secret Manager; here we rely
 * entirely on process.env (Replit Secrets).
 */
function initializeClient() {
    console.log('[SecretManager] Running on Replit — using environment variables only.');
    return false;
}

/**
 * Resolve a secret from environment variables (with optional fallback).
 */
async function getSecret(secretName, fallbackEnvVar = null, fallbackValue = null) {
    if (secretCache[secretName]) {
        return secretCache[secretName];
    }

    if (fallbackEnvVar && process.env[fallbackEnvVar]) {
        const value = process.env[fallbackEnvVar];
        secretCache[secretName] = value;
        return value;
    }

    if (fallbackValue) {
        secretCache[secretName] = fallbackValue;
        return fallbackValue;
    }

    throw new Error(`Secret not found: ${secretName} (set it as a Replit Secret or environment variable)`);
}

function clearCache() {
    secretCache = {};
}

module.exports = {
    initializeClient,
    getSecret,
    clearCache,
    secretCache: () => secretCache
};
