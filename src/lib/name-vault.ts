// 门禁名称保险箱的客户端解析器（纯前端，不依赖安全上下文）。
// ⚠️ 算法必须与 scripts/prepare-brief.mjs 里的 fnv1a / keystream / buildVaultEntry 完全一致，
//    改动其中一边时另一边必须同步，否则门禁会失效（构建脚本自带自检，可发现不一致）。

import type { VaultEntry } from "@/types/brief";

const VAULT_SALT = "chamiko-brief-v1";

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function keystream(seed: number, length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    if (i % 4 === 0) {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      state = (t ^ (t >>> 14)) >>> 0;
    }
    bytes[i] = (state >>> ((i % 4) * 8)) & 0xff;
  }
  return bytes;
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** 允许出现字符：排除控制字符（随机字节解出来几乎必然含控制字符或非法 UTF-8） */
const PRINTABLE = /^[^\u0000-\u001f\u007f]+$/u;

function decodeEntry(entry: VaultEntry, key: string): string | null {
  const cipher = base64ToBytes(entry.c);
  const stream = keystream(fnv1a(`${VAULT_SALT}|ks|${key}`), cipher.length);
  const plain = new Uint8Array(cipher.length);
  for (let i = 0; i < cipher.length; i++) plain[i] = cipher[i] ^ stream[i];

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    return null;
  }

  if (!text || text.length > 200 || !PRINTABLE.test(text)) return null;
  return text;
}

/**
 * 按输入解析真实名称。
 * 输入不区分大小写（统一折叠小写后定位）；若同一层级存在只差大小写的同名文件夹，
 * 精确输入优先进入自己那个文件夹，其余写法落到排序靠前的那一个。
 */
export function resolveVaultName(entries: VaultEntry[], input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed || entries.length === 0) return null;

  const key = trimmed.toLowerCase();
  const lookup = fnv1a(`${VAULT_SALT}|lk|${key}`).toString(16);
  const candidates = entries.filter((entry) => entry.k === lookup);
  if (candidates.length === 0) return null;

  const names = candidates
    .map((entry) => decodeEntry(entry, key))
    .filter((name): name is string => name !== null);
  if (names.length === 0) return null;

  return names.find((name) => name === trimmed) || [...names].sort()[0];
}
