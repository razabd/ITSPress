/**
 * lcpDecrypt.ts — LCP Basic-Profile decryption untuk web reader ITSPress
 *
 * LCP basic-profile menggunakan AES-256-CBC dengan W3C padding scheme:
 * hanya byte terakhir = panjang padding, byte lainnya acak (bukan PKCS#7).
 * Web Crypto API memakai PKCS#7 dan akan throw jika dipakai langsung.
 * Modul ini menggunakan aes-js yang memberikan CBC tanpa validasi padding.
 *
 * Alur dekripsi:
 *   passphrase → SHA-256 → userKey (32 byte)
 *   lcpl.encryption.content_key.encrypted_value → AES-256-CBC decrypt(userKey) → contentKey (32 byte)
 *   publication.pdf (dari .lcpdf ZIP) → AES-256-CBC decrypt(contentKey) → PDF plaintext
 */

import * as aesjs from 'aes-js';
import JSZip from 'jszip';

// ── Helpers ──────────────────────────────────────────────────────────────────

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * AES-256-CBC decrypt dengan W3C padding unpadding.
 * W3C padding: hanya byte terakhir = pad length. Byte lain bisa acak.
 * Kita strip sejumlah padLength byte dari akhir output.
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Turunkan user key dari passphrase: SHA-256(passphrase) → 32 byte.
 * Identik dengan cara backend menyimpan LCPPassphraseHash sebelum hex-encode.
 */
export async function deriveUserKey(passphrase: string): Promise<Uint8Array> {
  const encoded = new TextEncoder().encode(passphrase);
  const hashBuf = await crypto.subtle.digest('SHA-256', encoded);
  return new Uint8Array(hashBuf);
}

/**
 * Dekripsi content key dari lcpl.
 * encrypted_value (base64) = IV(16) || ciphertext → AES-256-CBC decrypt dengan userKey.
 * Hasil = content key 32 byte.
 */
export function decryptContentKey(encryptedValueB64: string, userKey: Uint8Array): Uint8Array {
  const raw = base64ToBytes(encryptedValueB64);
  if (raw.length < 32) throw new Error('encrypted_value terlalu pendek');
  const iv = raw.slice(0, 16);
  const ciphertext = raw.slice(16);
  return aesCbcDecryptW3C(userKey, iv, ciphertext);
}

/**
 * Dekripsi resource terenkripsi LCP (PDF atau entri EPUB).
 * Format: IV(16) || ciphertext → AES-256-CBC decrypt dengan contentKey.
 */
export function decryptResource(encrypted: Uint8Array, contentKey: Uint8Array): Uint8Array {
  if (encrypted.length < 32) throw new Error('Resource terenkripsi terlalu pendek');
  const iv = encrypted.slice(0, 16);
  const ciphertext = encrypted.slice(16);
  return aesCbcDecryptW3C(contentKey, iv, ciphertext);
}

// ── LCPL Types ─────────────────────────────────────────────────────────────────

export interface LcplLink {
  rel: string;
  href: string;
  type?: string;
  title?: string;
  length?: number;
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
}

/** Cari link berdasarkan rel dari array links lcpl */
export function getLcplLink(lcpl: Lcpl, rel: string): LcplLink | undefined {
  return lcpl.links.find(l => l.rel === rel);
}

// ── .lcpdf extraction ─────────────────────────────────────────────────────────

/**
 * Ekstrak bytes `publication.pdf` dari .lcpdf (ZIP) yang sudah diunduh.
 * .lcpdf adalah ZIP berisi: manifest.json, publication.pdf (terenkripsi), opsional cover.jpg.
 */
export async function extractPublicationFromLcpdf(lcpdfBuffer: ArrayBuffer): Promise<Uint8Array> {
  const zip = await JSZip.loadAsync(lcpdfBuffer);
  const pdfEntry = zip.file('publication.pdf');
  if (!pdfEntry) throw new Error('publication.pdf tidak ditemukan di dalam .lcpdf');
  return pdfEntry.async('uint8array');
}

/**
 * Verifikasi passphrase menggunakan key_check dari lcpl sebelum dekripsi penuh.
 * key_check = AES-256-CBC_W3C(userKey, licenseID) — format IV(16) || ciphertext.
 * Jika passphrase salah, hasil dekripsi tidak cocok dengan lcpl.id.
 */
export async function verifyPassphrase(passphrase: string, lcpl: Lcpl): Promise<void> {
  const { key_check } = lcpl.encryption.user_key;
  if (!key_check) return;

  const userKey = await deriveUserKey(passphrase);
  const raw = base64ToBytes(key_check);
  if (raw.length < 32) return;

  let decrypted: Uint8Array;
  try {
    decrypted = aesCbcDecryptW3C(userKey, raw.slice(0, 16), raw.slice(16));
  } catch {
    throw new Error('Passphrase salah. Pastikan menggunakan passphrase ITSPress yang benar.');
  }

  const decoded = new TextDecoder().decode(decrypted).replace(/\0+$/, '');
  if (decoded !== lcpl.id) {
    throw new Error('Passphrase salah. Pastikan menggunakan passphrase ITSPress yang benar.');
  }
}

/**
 * Full pipeline: passphrase + lcpl + .lcpdf bytes → plaintext PDF bytes
 */
export async function decryptLcpdf(
  passphrase: string,
  lcpl: Lcpl,
  lcpdfBuffer: ArrayBuffer,
): Promise<Uint8Array> {
  await verifyPassphrase(passphrase, lcpl);
  const userKey = await deriveUserKey(passphrase);
  const contentKey = decryptContentKey(lcpl.encryption.content_key.encrypted_value, userKey);
  const encryptedPdf = await extractPublicationFromLcpdf(lcpdfBuffer);
  return decryptResource(encryptedPdf, contentKey);
}

// ── EPUB decryption ───────────────────────────────────────────────────────────

interface EncryptedResource {
  uri: string;
  method: number; // 0=stored, 8=deflate (kompresi sebelum enkripsi)
}

function parseEncryptionXml(xmlStr: string): EncryptedResource[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'text/xml');
  const resources: EncryptedResource[] = [];
  for (const node of doc.querySelectorAll('EncryptedData')) {
    const uriEl = node.querySelector('CipherReference');
    const comprEl = node.querySelector('Compression');
    if (!uriEl) continue;
    resources.push({
      uri: uriEl.getAttribute('URI') || '',
      method: comprEl ? parseInt(comprEl.getAttribute('Method') || '0', 10) : 0,
    });
  }
  return resources;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data as unknown as Uint8Array<ArrayBuffer>);
  writer.close();
  const chunks: Uint8Array[] = [];
  const reader = ds.readable.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value!);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/**
 * Full pipeline: passphrase + lcpl + encrypted EPUB bytes → decrypted EPUB bytes.
 * Membaca META-INF/encryption.xml, mendekripsi setiap resource yang terenkripsi,
 * lalu menyusun ulang EPUB ZIP yang bersih.
 */
export async function decryptEpub(
  passphrase: string,
  lcpl: Lcpl,
  epubBuffer: ArrayBuffer,
): Promise<Uint8Array> {
  await verifyPassphrase(passphrase, lcpl);
  const userKey = await deriveUserKey(passphrase);
  const contentKey = decryptContentKey(lcpl.encryption.content_key.encrypted_value, userKey);

  const zip = await JSZip.loadAsync(epubBuffer);

  const encXmlEntry = zip.file('META-INF/encryption.xml');
  if (!encXmlEntry) throw new Error('encryption.xml tidak ditemukan. File mungkin bukan EPUB terenkripsi LCP.');
  const encXmlStr = await encXmlEntry.async('string');
  const encMap = new Map(parseEncryptionXml(encXmlStr).map(r => [r.uri, r]));

  const newZip = new JSZip();

  // mimetype wajib entry pertama dan tidak terkompresi (standar EPUB)
  const mimetypeEntry = zip.file('mimetype');
  if (mimetypeEntry) {
    newZip.file('mimetype', await mimetypeEntry.async('uint8array'), { compression: 'STORE' });
  }

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || path === 'mimetype' || path === 'META-INF/encryption.xml') continue;

    const res = encMap.get(path);
    if (res) {
      const rawBytes = await entry.async('uint8array');
      const decrypted = decryptResource(rawBytes, contentKey);
      const plain = res.method === 8 ? await inflateRaw(decrypted) : decrypted;
      newZip.file(path, plain, { compression: 'DEFLATE' });
    } else {
      newZip.file(path, await entry.async('uint8array'), { binary: true });
    }
  }

  return newZip.generateAsync({ type: 'uint8array' });
}
