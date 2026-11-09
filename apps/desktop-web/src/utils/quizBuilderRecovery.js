const DATABASE_NAME = 'quiz-builder-recovery';
const DATABASE_VERSION = 1;
const STORE_NAME = 'checkpoints';

let databasePromise;

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('This browser does not support local quiz recovery.'));
        return;
      }

      const request = globalThis.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME, { keyPath: 'userId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Could not open local quiz recovery storage.'));
      request.onblocked = () => reject(new Error('Local quiz recovery storage is blocked by another tab.'));
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }

  return databasePromise;
}

const checkpointKey = (userId, isChallenge) => `${userId}:${isChallenge ? 'challenge' : 'quiz'}`;

export async function loadQuizBuilderCheckpoint(userId, isChallenge) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get(checkpointKey(userId, isChallenge));
    request.onsuccess = () => {
      if (request.result) return resolve(request.result);
      const legacy = store.get(String(userId));
      legacy.onsuccess = () => resolve(legacy.result && Boolean(legacy.result.isChallenge) === isChallenge ? legacy.result : null);
    };
    transaction.onerror = () => reject(transaction.error || new Error('Could not read the local quiz checkpoint.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not read the local quiz checkpoint.'));
  });
}

export async function saveQuizBuilderCheckpoint(userId, checkpoint) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      ...checkpoint,
      userId: checkpointKey(userId, checkpoint.isChallenge),
      savedAt: new Date().toISOString(),
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the local quiz checkpoint.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not save the local quiz checkpoint.'));
  });
}

export async function deleteQuizBuilderCheckpoint(userId, isChallenge) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    store.delete(checkpointKey(userId, isChallenge));
    const legacy = store.get(String(userId));
    legacy.onsuccess = () => {
      if (legacy.result && Boolean(legacy.result.isChallenge) === isChallenge) store.delete(String(userId));
    };
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear the local quiz checkpoint.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not clear the local quiz checkpoint.'));
  });
}
