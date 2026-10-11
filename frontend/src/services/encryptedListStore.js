import { decryptJSON, encryptJSON } from './secureStorage';

export const STORAGE_UPDATED_EVENT = 'ta:portfolio-updated';
export const STORAGE_ERROR_EVENT = 'ta:portfolio-storage-error';

function looksEncrypted(raw) {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed?.iv === 'string' && typeof parsed?.ct === 'string';
  } catch {
    return false;
  }
}

function emit(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

// A device-local, AES-GCM encrypted array in localStorage.
// `normalize(entry)` returns a clean record or null (invalid entries are dropped).
export function createEncryptedListStore({ key, normalize }) {
  const backupKey = `${key}:unreadable`;
  let chain = Promise.resolve();

  // Serialize read-modify-write so concurrent calls cannot clobber each other
  // (encryption makes them async).
  function enqueue(task) {
    const run = chain.then(task, task);
    chain = run.then(
      () => {},
      () => {}
    );
    return run;
  }

  function backup(raw) {
    try {
      // Keep the FIRST unreadable blob only; never overwrite an earlier backup.
      if (!localStorage.getItem(backupKey)) localStorage.setItem(backupKey, raw);
    } catch {
      // Storage full or blocked: nothing more we can do.
    }
  }

  function dropStaleBackup(raw) {
    try {
      // The blob became readable again (transient failure): the copy is redundant.
      if (localStorage.getItem(backupKey) === raw) localStorage.removeItem(backupKey);
    } catch {
      // Ignore unavailable storage.
    }
  }

  async function readDetailed() {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch {
      return { items: [], status: 'empty' };
    }
    if (!raw) return { items: [], status: 'empty' };

    try {
      const parsed = await decryptJSON(raw);
      if (Array.isArray(parsed)) {
        dropStaleBackup(raw);
        return { items: parsed.map(normalize).filter(Boolean), status: 'ok' };
      }
    } catch {
      // fall through: treated as unreadable
    }
    backup(raw);
    return { items: [], status: looksEncrypted(raw) ? 'unreadable' : 'corrupt' };
  }

  // update(items) returns the next array, or a falsy value to signal "invalid input".
  function mutate(update) {
    return enqueue(async () => {
      const { items, status } = await readDetailed();
      // Never write over a blob we could not read: that destroys the user's data.
      if (status === 'unreadable' || status === 'corrupt') {
        return { ok: false, reason: 'unreadable' };
      }
      const next = update(items);
      if (!next) return { ok: false, reason: 'invalid' };

      const clean = next.map(normalize).filter(Boolean);
      try {
        if (clean.length) localStorage.setItem(key, await encryptJSON(clean));
        else localStorage.removeItem(key);
      } catch (error) {
        emit(STORAGE_ERROR_EVENT, {
          key,
          name: error?.name || 'Error',
          quota: error?.name === 'QuotaExceededError',
        });
        return { ok: false, reason: 'write_failed' };
      }
      emit(STORAGE_UPDATED_EVENT, { key });
      return { ok: true };
    });
  }

  // "Start fresh": drops the unreadable primary blob. The backup copy is kept.
  function clear() {
    return enqueue(async () => {
      try {
        localStorage.removeItem(key);
      } catch {
        return { ok: false, reason: 'write_failed' };
      }
      emit(STORAGE_UPDATED_EVENT, { key });
      return { ok: true };
    });
  }

  return { key, backupKey, readDetailed, mutate, clear };
}
