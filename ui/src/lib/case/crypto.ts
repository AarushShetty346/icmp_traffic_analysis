/** Browser-only authenticated-encryption demonstration. No key or text leaves the page. */
const SALT_BYTES = 16;
const IV_BYTES = 12;
const ITERATIONS = 100_000;

export function bytesToBits(bytes: Uint8Array): number[] {
  return [...bytes].flatMap((byte) => Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1));
}

function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  bits.forEach((bit, i) => { bytes[Math.floor(i / 8)] |= bit << (7 - (i % 8)); });
  return bytes;
}

async function keyFromPassphrase(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITERATIONS, hash: "SHA-256" }, material,
    { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
}

export async function lockMessage(message: string, passphrase: string): Promise<Uint8Array> {
  if (!passphrase) throw new Error("Enter a shared key phrase first.");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await keyFromPassphrase(passphrase, salt);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, new TextEncoder().encode(message)));
  const wire = new Uint8Array(salt.length + iv.length + ciphertext.length);
  wire.set(salt); wire.set(iv, salt.length); wire.set(ciphertext, salt.length + iv.length);
  return wire;
}

export async function unlockMessage(wire: Uint8Array, passphrase: string): Promise<string> {
  if (wire.length < SALT_BYTES + IV_BYTES + 16) throw new Error("The encrypted message is incomplete.");
  const salt = wire.slice(0, SALT_BYTES);
  const iv = wire.slice(SALT_BYTES, SALT_BYTES + IV_BYTES);
  const data = wire.slice(SALT_BYTES + IV_BYTES);
  const key = await keyFromPassphrase(passphrase, salt);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, data as BufferSource);
  return new TextDecoder("utf-8", { fatal: true }).decode(plain);
}

function random(seed: number): () => number {
  let x = seed >>> 0;
  return () => { x += 0x6D2B79F5; let t = x; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function normal(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
}

/** A deterministic model of receiver timestamps for a locked message; no packets are sent. */
export function simulateLockedMessage(wire: Uint8Array, gap0: number, gap1: number, jitterMs: number): { received: Uint8Array; bitAccuracy: number; times: number[] } {
  const bits = bytesToBits(wire);
  const rand = random(wire.slice(0, 8).reduce((s, b) => (Math.imul(s, 31) + b) >>> 0, 2166136261) + jitterMs);
  const sent = [0];
  bits.forEach((bit) => sent.push(sent[sent.length - 1] + (bit ? gap1 : gap0)));
  const times = sent.map((t) => t + Math.max(0, 0.001 + normal(rand) * jitterMs / 1000));
  const decoded = times.slice(1).map((t, i) => Number(t - times[i] >= 1));
  const correct = decoded.filter((bit, i) => bit === bits[i]).length;
  return { received: bitsToBytes(decoded), bitAccuracy: bits.length ? correct / bits.length : 1, times };
}
