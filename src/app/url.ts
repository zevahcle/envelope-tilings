/** Compact state sharing through the URL hash (#s=…). */

const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string): Uint8Array => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(t + '='.repeat((4 - (t.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const w = stream.writable.getWriter();
  void w.write(bytes);
  void w.close();
  const buf = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buf);
}

export async function encodeState(obj: unknown): Promise<string> {
  const json = JSON.stringify(obj, (_k, v) => (typeof v === 'number' ? Number(v.toFixed(4)) : v));
  const raw = new TextEncoder().encode(json);
  if (typeof CompressionStream === 'undefined') return 'j' + b64(raw);
  return 'z' + b64(await pipe(raw, new CompressionStream('deflate-raw')));
}

export async function decodeState<T>(s: string): Promise<T | null> {
  try {
    const kind = s[0];
    const bytes = unb64(s.slice(1));
    const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return JSON.parse(new TextDecoder().decode(raw)) as T;
  } catch {
    return null;
  }
}

export function readHash(): string | null {
  const m = /[#&]s=([^&]+)/.exec(location.hash);
  return m ? m[1]! : null;
}

export function writeHash(s: string): void {
  history.replaceState(null, '', `#s=${s}`);
}
