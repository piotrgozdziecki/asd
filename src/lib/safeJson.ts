/**
 * Ultra-safe JSON serialization utilities that prevent circular structure errors,
 * DOM element serialization, React Fiber traversal, and native class binding issues.
 */

export function isDomOrFiber(val: any): boolean {
  if (!val || (typeof val !== 'object' && typeof val !== 'function')) return false;

  // DOM Elements / Nodes / Windows / Documents / Events / EventTargets
  try {
    if (
      (typeof HTMLElement !== 'undefined' && val instanceof HTMLElement) ||
      (typeof Node !== 'undefined' && val instanceof Node) ||
      (typeof Event !== 'undefined' && val instanceof Event) ||
      (typeof EventTarget !== 'undefined' && val instanceof EventTarget) ||
      (typeof Window !== 'undefined' && val instanceof Window) ||
      (typeof Document !== 'undefined' && val instanceof Document) ||
      typeof val.nodeType === 'number' ||
      typeof val.tagName === 'string' ||
      typeof val.nodeName === 'string' ||
      (typeof val.addEventListener === 'function' && typeof val.removeEventListener === 'function')
    ) {
      return true;
    }
  } catch {
    return true;
  }

  // React Fiber, Synthetic Event, or HTML/DOM constructors
  try {
    const cName = val.constructor?.name || '';
    if (
      cName === 'FiberNode' ||
      cName === 'SyntheticBaseEvent' ||
      cName.startsWith('HTML') ||
      cName.endsWith('Element') ||
      cName.endsWith('Node') ||
      cName.endsWith('Event') ||
      cName.includes('Video') ||
      cName.includes('Canvas') ||
      cName.includes('Fiber')
    ) {
      return true;
    }
  } catch {
    return true;
  }

  // React Fiber heuristics (independent of constructor name or minification)
  try {
    if (
      ('stateNode' in val && ('memoizedProps' in val || 'memoizedState' in val || 'child' in val || 'sibling' in val || 'return' in val)) ||
      ('_reactName' in val && 'nativeEvent' in val) ||
      ('_targetInst' in val) ||
      ('dispatchConfig' in val)
    ) {
      return true;
    }

    // Check for React internal properties attached to DOM elements (e.g. __reactFiber$...)
    const keys = Object.keys(val);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (k.startsWith('__reactFiber') || k.startsWith('__reactProps') || k.startsWith('__reactEvents')) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
}

export function deepCleanObject<T = any>(val: any, visited = new WeakSet<any>(), depth = 0): any {
  if (val === null || val === undefined) return val;
  if (depth > 20) return undefined;

  const type = typeof val;
  if (type === 'string' || type === 'number' || type === 'boolean') {
    return val;
  }

  if (type === 'function' || type === 'symbol') {
    return undefined;
  }

  // Skip DOM, Fiber, Window, Document, Blob, File, Streams
  if (isDomOrFiber(val)) {
    return undefined;
  }

  if (
    (typeof Blob !== 'undefined' && val instanceof Blob) ||
    (typeof File !== 'undefined' && val instanceof File) ||
    (typeof ArrayBuffer !== 'undefined' && val instanceof ArrayBuffer)
  ) {
    return undefined;
  }

  // Handle circular references
  if (type === 'object') {
    if (visited.has(val)) {
      return undefined;
    }
    visited.add(val);
  }

  // Error instances (extract safe serializable fields)
  if (val instanceof Error) {
    return {
      name: val.name,
      message: val.message,
      stack: val.stack ? String(val.stack).substring(0, 1000) : undefined
    };
  }

  // Date instance
  if (val instanceof Date) {
    return val.toISOString();
  }

  // Array
  if (Array.isArray(val)) {
    const cleanArr: any[] = [];
    for (let i = 0; i < val.length; i++) {
      const item = deepCleanObject(val[i], visited, depth + 1);
      cleanArr.push(item !== undefined ? item : null);
    }
    return cleanArr;
  }

  // Plain Object / Dictionary
  if (type === 'object') {
    const cleanObj: Record<string, any> = {};
    const keys = Object.keys(val);
    for (const key of keys) {
      // Skip internal React & DOM Fiber keys
      if (
        key.startsWith('__react') ||
        key.startsWith('_react') ||
        key.startsWith('$$') ||
        key === '_owner' ||
        key === '_store' ||
        key === 'stateNode' ||
        key === 'nativeEvent' ||
        key === 'target' ||
        key === 'currentTarget' ||
        key === 'srcElement'
      ) {
        continue;
      }

      const cleanVal = deepCleanObject(val[key], visited, depth + 1);
      if (cleanVal !== undefined) {
        cleanObj[key] = cleanVal;
      }
    }
    return cleanObj;
  }

  return undefined;
}

export function safeStringify(obj: any, space?: number | string): string {
  try {
    const cleaned = deepCleanObject(obj);
    if (cleaned === undefined) return '{}';
    
    const seen = new WeakSet();
    const str = JSON.stringify(cleaned, (key, val) => {
      if (
        key.startsWith('__react') ||
        key.startsWith('_react') ||
        key.startsWith('$$') ||
        key === '_owner' ||
        key === '_store' ||
        key === 'stateNode' ||
        key === 'nativeEvent' ||
        key === 'target' ||
        key === 'currentTarget' ||
        key === 'srcElement'
      ) {
        return undefined;
      }
      if (val !== null && typeof val === 'object') {
        if (isDomOrFiber(val) || seen.has(val)) {
          return undefined;
        }
        seen.add(val);
      }
      if (typeof val === 'function' || typeof val === 'symbol') {
        return undefined;
      }
      return val;
    }, space);

    return str || '{}';
  } catch (err) {
    console.warn('[safeStringify] Fallback triggered:', err);
    return '{}';
  }
}

export function safeClone<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  try {
    const jsonStr = safeStringify(obj);
    return JSON.parse(jsonStr) as T;
  } catch {
    return deepCleanObject(obj) as T;
  }
}

export function safeParse<T>(jsonString: string, fallback: T): T {
  try {
    if (!jsonString || typeof jsonString !== 'string') return fallback;
    const parsed = JSON.parse(jsonString);
    return parsed !== undefined && parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Automatically patches window.JSON.stringify globally so that any call anywhere
 * in the window realm (including Vite, AI Studio iframe bridge, React error logs)
 * safely serializes circular objects, HTMLVideoElements, and FiberNodes without
 * throwing "Uncaught TypeError: Converting circular structure to JSON".
 */
export function patchGlobalJsonStringify(): void {
  if (typeof window === 'undefined' || (window as any).__json_stringify_patched) {
    return;
  }
  (window as any).__json_stringify_patched = true;

  const originalStringify = JSON.stringify;

  JSON.stringify = function (value: any, replacer?: any, space?: any): string {
    const seen = new WeakSet();

    const safeReplacer = (key: string, val: any) => {
      let currentVal = val;
      if (typeof replacer === 'function') {
        currentVal = replacer(key, val);
      }

      if (currentVal !== null && typeof currentVal === 'object') {
        // Strip or serialize DOM elements safely
        if (
          (typeof HTMLElement !== 'undefined' && currentVal instanceof HTMLElement) ||
          (typeof Node !== 'undefined' && currentVal instanceof Node) ||
          (typeof Event !== 'undefined' && currentVal instanceof Event) ||
          (typeof EventTarget !== 'undefined' && currentVal instanceof EventTarget) ||
          (typeof Window !== 'undefined' && currentVal instanceof Window) ||
          isDomOrFiber(currentVal)
        ) {
          if (typeof HTMLElement !== 'undefined' && currentVal instanceof HTMLElement) {
            return `[${currentVal.tagName || currentVal.constructor?.name || 'HTMLElement'}]`;
          }
          return undefined;
        }

        if (
          key.startsWith('__reactFiber') ||
          key.startsWith('__reactProps') ||
          key.startsWith('__reactEvents') ||
          key === 'stateNode' ||
          key === 'nativeEvent' ||
          key === '_targetInst'
        ) {
          return undefined;
        }

        if (seen.has(currentVal)) {
          return '[Circular]';
        }
        seen.add(currentVal);
      }

      return currentVal;
    };

    try {
      if (Array.isArray(replacer)) {
        return originalStringify.call(this, value, replacer, space);
      }
      return originalStringify.call(this, value, safeReplacer, space);
    } catch {
      try {
        const cleaned = deepCleanObject(value);
        return originalStringify.call(this, cleaned, typeof replacer === 'function' ? replacer : undefined, space);
      } catch {
        return '{}';
      }
    }
  };
}
