// db.js — minimal IndexedDB wrapper for storing sample entries locally.
// No backend yet: every entry lives in the browser until a future "upload"
// step is wired up to a real server. Swap uploadEntry() below for a real
// fetch() call once a backend endpoint exists.

const DB_NAME = "waterwatch";
const DB_VERSION = 1;
const STORE = "entries";

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("uploaded", "uploaded");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
  });
}

const DB = {
  async addEntry(entry) {
    return withStore("readwrite", (store) => store.add(entry));
  },

  async getAllEntries() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      req.onerror = () => reject(req.error);
    });
  },

  async getEntry(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async updateEntry(entry) {
    return withStore("readwrite", (store) => store.put(entry));
  },

  async deleteEntry(id) {
    return withStore("readwrite", (store) => store.delete(id));
  },

  async pendingCount() {
    const all = await this.getAllEntries();
    return all.filter((e) => !e.uploaded).length;
  },

  // Placeholder for the real upload step. There's no backend configured
  // yet, so this just simulates a network round-trip and marks the entry
  // uploaded locally. Replace the body with a fetch() to your API/Firebase/
  // Supabase endpoint when the backend is ready.
  async uploadEntry(entry) {
    await new Promise((r) => setTimeout(r, 700));
    entry.uploaded = true;
    entry.uploadedAt = new Date().toISOString();
    await this.updateEntry(entry);
    return entry;
  },
};
