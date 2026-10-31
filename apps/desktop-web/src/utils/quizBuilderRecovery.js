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

export async function loadQuizBuilderCheckpoint(userId) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(String(userId));
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('Could not read the local quiz checkpoint.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not read the local quiz checkpoint.'));
  });
}

export async function saveQuizBuilderCheckpoint(userId, checkpoint) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({
      ...checkpoint,
      userId: String(userId),
      savedAt: new Date().toISOString(),
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save the local quiz checkpoint.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not save the local quiz checkpoint.'));
  });
}

export async function deleteQuizBuilderCheckpoint(userId) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(String(userId));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear the local quiz checkpoint.'));
    transaction.onabort = () => reject(transaction.error || new Error('Could not clear the local quiz checkpoint.'));
  });
}
