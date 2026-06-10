/**
 * lcpDecrypt.ts — LCP ITS Press decryption + signature verification
 *
 * Verifikasi (Opsi A — signature only):
 *   LCPL signature (RSA-SHA256) diverifikasi menggunakan public key provider cert
 *   yang di-embed langsung. Tidak memerlukan chain verification / library X.509.
 *
 * Alur dekripsi:
 *   passphrase → SHA-256 → userKey (32 byte)
 *   lcpl.encryption.content_key.encrypted_value → AES-256-CBC decrypt(userKey) → contentKey (32 byte)
 *   publication.pdf (dari .lcpdf ZIP) → AES-256-CBC decrypt(contentKey) → PDF plaintext
 *
 * Catatan padding:
 *   LCP menggunakan W3C padding: hanya byte terakhir = pad length, byte lain acak.
 *   Web Crypto API memakai PKCS#7 dan akan throw. Modul ini menggunakan aes-js
 *   yang memberikan CBC tanpa validasi padding.
 */

import * as aesjs from 'aes-js';
import JSZip from 'jszip';

// ── ITS Press Provider Public Key (SPKI) ──────────────────────────────────────
// Dihasilkan: openssl x509 -in cert-itspress.pem -pubkey -noout | openssl pkey -pubin -outform DER | base64 -w 0
// Ini adalah public key — bukan secret. Aman di-embed di frontend.
const ITSPRESS_PROVIDER_SPKI_B64 =
  'MIICIjANBgkqhkiG9w0BAQEFAAOCAg8AMIICCgKCAgEAyQvjhy7N7IWqAOuNnyh' +
  'qW7UnlbyhgxMUvMtthVEDjk0z+6Xmy7bYJTTNgh6sggap6SAGLnAjrG5Ahcondy' +
  '+gLQk5SJ9Qlupsp5UaBN2yWBvU/9l5mCoM865R8eVwBgl3u57hIsI/A3YPOFSVBx' +
  'ulhfTaolHIuFgDeXPNz2jqzN+IPlgXG8PsPaNqpXb879wYZhPGklAlaU3C7GjXQN' +
  'Gd3s2sJT5K0xW2TI9udvpOPtpeQtbINHv+f0DX6rDQY8BDnR7h8r/w2iKb4suDm' +
  'op1ummY+suwYovK1moYtPAln6imlrqmzqhPlaXBSeLe4pyoZwl4AMAgSbivLnSLu' +
  'OwD5jA8Qt5kwsoY6W8JcXoPUnX+8G6/hjFy7/qaLQALFZUdL1dJQ2K2UE+GeW/3C' +
  'uxeqW7etl2Fo6+eEjnxsjt69h99NKo8qBYGCqQmyn/mV1gLIp6IFnyV7zQ02Nt9K' +
  'VOhgNk7qGlkkQx3GCS7YNAwM4B6pkDBsiK3v3eCMEc0ygYWISKz+jMcna/tRiC6g' +
  'RmZMmRBLlh/zExvLD2byz44WAEb5KUFkXohMmkG8amKSxr+Ta+fCxW8XctcbxWBh' +
  'gqzBs5DO3Z9GVrhVCZjaVxf1AD8vN8jhd00sXEevZbEH27SD2SDyx2K9ANzz5xWt' +
  'XSD66HWtzAmTn8H3oTJdeT39V0CAwEAAQ==';

// ── Helpers ──────────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * AES-256-CBC decrypt dengan W3C padding unpadding.
 * W3C padding: hanya byte terakhir = pad length. Byte lain bisa acak.
 */
function aesCbcDecryptW3C(key: Uint8Array, iv: Uint8Array, ciphertext: Uint8Array): Uint8Array {
  const aesCbc = new aesjs.ModeOfOperation.cbc(key, iv);
  const decrypted = aesCbc.decrypt(ciphertext);
  const padLen = decrypted[decrypted.length - 1];
  if (padLen === 0 || padLen > 16) {
    throw new Error(`Padding tidak valid: ${padLen}. Kemungkinan passphrase salah.`);
  }
  return decrypted.slice(0, decrypted.length - padLen);
}

// ── LCPL Types ─────────────────────────────────────────────────────────────────

export interface LcplLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
  length?: number;
}

export interface LcplSignature {
  algorithm: string;
  certificate: string;
  value: string; // base64 RSA-SHA256 signature
}

export interface Lcpl {
  id: string;
  provider: string;
  issued: string;
  encryption: {
    profile: string;
    content_key: {
      algorithm: string;
      encrypted_value: string;
    };
    user_key: {
      algorithm: string;
      text_hint: string;
      key_check?: string;
    };
  };
  links: LcplLink[];
  user: { id: string; email: string; name: string };
  rights: { start: string; end: string; print: number; copy: number };
  signature?: LcplSignature;
}

export function getLcplLink(lcpl: Lcpl, rel: string): LcplLink | undefined {
  return lcpl.links.find(l => l.rel === rel);
}

// ── Canonicalization (mereplikasi Go's sign.Canon) ─────────────────────────

/**
 * Urutkan semua key objek secara rekursif.
 * Mereplikasi perilaku map[string]interface{} Go yang auto-sort saat re-encode JSON.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Hasilkan canonical bytes LCPL (tanpa field signature).
 * Identik dengan output Go's Canon(): JSON dengan key terurut alfabet, tanpa newline akhir.
 */
function canonicalizeLcpl(lcpl: Lcpl): ArrayBuffer {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { signature: _sig, ...withoutSig } = lcpl;
  const sorted = sortKeysDeep(withoutSig);
  return new TextEncoder().encode(JSON.stringify(sorted)).buffer as ArrayBuffer;
}

// ── Signature Verification ────────────────────────────────────────────────────

// Cache public key agar tidak re-import setiap kali
let _cachedProviderKey: CryptoKey | null = null;

async function getProviderPublicKey(): Promise<CryptoKey> {
  if (_cachedProviderKey) return _cachedProviderKey;
  const spkiBytes = base64ToBytes(ITSPRESS_PROVIDER_SPKI_B64.replace(/\s/g, ''));
  _cachedProviderKey = await crypto.subtle.importKey(
    'spki',
    spkiBytes.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    false,
    ['verify'],
  );
  return _cachedProviderKey;
}

/**
 * Verifikasi signature LCPL menggunakan public key provider ITS Press.
 * Throw jika signature tidak valid atau field signature tidak ada.
 */
export async function verifyLcplSignature(lcpl: Lcpl): Promise<void> {
  if (!lcpl.signature) {
    throw new Error('LCPL tidak memiliki field signature — lisensi tidak valid');
  }

  const providerKey = await getProviderPublicKey();
  const canonical = canonicalizeLcpl(lcpl);
  const sigBytes = base64ToBytes(lcpl.signature.value);

  const valid = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
    providerKey,
    sigBytes.buffer as ArrayBuffer,
    canonical,
  );

  if (!valid) {
    throw new Error(
      'Signature LCPL tidak valid. Lisensi mungkin telah dimodifikasi atau dipalsukan.'
    );
  }
}

// ── Decryption ────────────────────────────────────────────────────────────────

/**
 * Turunkan user key dari passphrase: SHA-256(passphrase) → 32 byte.
 */
export async function deriveUserKey(passphrase: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(passphrase);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(hashBuf);
}

/**
 * Dekripsi content key dari lcpl.
 * encrypted_value (base64) = IV(16) || ciphertext → AES-256-CBC decrypt dengan userKey.
 */
export function decryptContentKey(encryptedValueB64: string, userKey: Uint8Array): Uint8Array {
  const raw = base64ToBytes(encryptedValueB64);
  if (raw.length < 32) throw new Error('encrypted_value terlalu pendek');
  const iv = raw.slice(0, 16);
  const ciphertext = raw.slice(16);
  return aesCbcDecryptW3C(userKey, iv, ciphertext);
}

/**
 * Dekripsi resource terenkripsi LCP.
 * Format: IV(16) || ciphertext → AES-256-CBC decrypt dengan contentKey.
 */
export function decryptResource(encrypted: Uint8Array, contentKey: Uint8Array): Uint8Array {
  if (encrypted.length < 32) throw new Error('Resource terenkripsi terlalu pendek');
  const iv = encrypted.slice(0, 16);
  const ciphertext = encrypted.slice(16);
  return aesCbcDecryptW3C(contentKey, iv, ciphertext);
}

// ── Passphrase validation (cepat, sebelum download konten) ───────────────────

/**
 * Validasi passphrase menggunakan field key_check di LCPL.
 * key_check = IV(16) || AES-CBC(userKey, licenseId.utf8)
 * Throw jika passphrase salah.
 */
export async function validatePassphrase(passphrase: string, lcpl: Lcpl): Promise<void> {
  const keyCheck = lcpl.encryption.user_key.key_check;
  if (!keyCheck) return; // Tidak ada key_check, lewati validasi

  const userKey = await deriveUserKey(passphrase);
  try {
    const raw = base64ToBytes(keyCheck);
    if (raw.length < 32) throw new Error('key_check terlalu pendek');
    const iv = raw.slice(0, 16);
    const ciphertext = raw.slice(16);
    const decrypted = aesCbcDecryptW3C(userKey, iv, ciphertext);
    const decryptedStr = new TextDecoder('utf-8').decode(decrypted);
    if (decryptedStr !== lcpl.id) {
      throw new Error('Sandi salah. Periksa kembali sandi ITSPress Anda.');
    }
  } catch (e) {
    const msg = (e as Error).message;
    if (msg.includes('Sandi salah')) throw e;
    throw new Error('Sandi salah. Periksa kembali sandi ITSPress Anda.');
  }
}

// ── .lcpdf extraction ─────────────────────────────────────────────────────────

export async function extractPublicationFromLcpdf(lcpdfBuffer: ArrayBuffer): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(lcpdfBuffer);
  const pdfEntry = zip.file('publication.pdf');
  if (!pdfEntry) throw new Error('publication.pdf tidak ditemukan di dalam .lcpdf');
  return pdfEntry.async('uint8array');
}

/**
 * Full pipeline: passphrase + lcpl + .lcpdf bytes → plaintext PDF bytes.
 */
export async function decryptLcpdf(
  passphrase: string,
  lcpl: Lcpl,
  lcpdfBuffer: ArrayBuffer,
): Promise<Uint8Array> {
  const userKey = await deriveUserKey(passphrase);
  const contentKey = decryptContentKey(lcpl.encryption.content_key.encrypted_value, userKey);
  const encryptedPdf = await extractPublicationFromLcpdf(lcpdfBuffer);
  return decryptResource(encryptedPdf, contentKey);
}
