import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
export const cn = (...a) => twMerge(clsx(a));
export const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
export const newId = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `b${Date.now()}${Math.random().toString(36).slice(2, 8)}`);
