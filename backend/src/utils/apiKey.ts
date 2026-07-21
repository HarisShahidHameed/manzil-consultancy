import crypto from 'crypto';

// "mzk" (Manzil Key) prefix makes leaked keys greppable/recognizable in logs, same
// idea as Stripe's "sk_live_" convention. 32 random bytes -> 43-char base64url body.
const KEY_PREFIX = 'mzk';

export const generateApiKey = (): { raw: string; keyPrefix: string; keyHash: string } => {
  const body = crypto.randomBytes(32).toString('base64url');
  const raw = `${KEY_PREFIX}_${body}`;
  // Shown in the management UI to identify a key without ever re-displaying the secret.
  const keyPrefix = raw.slice(0, KEY_PREFIX.length + 7);
  return { raw, keyPrefix, keyHash: hashApiKey(raw) };
};

// One-way hash, not bcrypt: this is a high-entropy random secret (not a user-chosen
// password), so a fast deterministic hash is fine and lets lookup use an indexed
// equality match instead of comparing against every stored hash.
export const hashApiKey = (raw: string): string =>
  crypto.createHash('sha256').update(raw).digest('hex');
