/**
 * IndexedDB Database Manager for Kiki Immersion Yomitan Dictionaries
 */
class KikiDictDB {
    constructor() {
        this.dbName = 'KikiImmersionDB';
        this.version = 1;
        this.db = null;
    }

    async open() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Dictionary metadata store
                if (!db.objectStoreNames.contains('dictionaries')) {
                    db.createObjectStore('dictionaries', { keyPath: 'id' });
                }

                // Terms store
                if (!db.objectStoreNames.contains('terms')) {
                    const termStore = db.createObjectStore('terms', { keyPath: 'id', autoIncrement: true });
                    termStore.createIndex('term', 'term', { unique: false });
                    termStore.createIndex('reading', 'reading', { unique: false });
                    termStore.createIndex('dictId', 'dictId', { unique: false });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this.db);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    /**
     * Get all installed dictionaries metadata
     */
    async getDictionaries() {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('dictionaries', 'readonly');
            const store = tx.objectStore('dictionaries');
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Save or update dictionary metadata
     */
    async saveDictionary(meta) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('dictionaries', 'readwrite');
            const store = tx.objectStore('dictionaries');
            const req = store.put(meta);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Toggle dictionary active state
     */
    async toggleDictionary(id, enabled) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('dictionaries', 'readwrite');
            const store = tx.objectStore('dictionaries');
            const getReq = store.get(id);
            getReq.onsuccess = () => {
                const dict = getReq.result;
                if (!dict) return reject(new Error('Dictionary not found'));
                dict.enabled = enabled;
                const putReq = store.put(dict);
                putReq.onsuccess = () => resolve(dict);
                putReq.onerror = () => reject(putReq.error);
            };
            getReq.onerror = () => reject(getReq.error);
        });
    }

    /**
     * Batch insert terms into terms store
     * @param {string} dictId 
     * @param {Array} rawEntries Yomitan Format 3 term records
     * @param {number} batchSize Chunk size for write transaction
     */
    async addTermsBatch(dictId, rawEntries, batchSize = 1500) {
        const db = await this.open();

        for (let i = 0; i < rawEntries.length; i += batchSize) {
            const chunk = rawEntries.slice(i, i + batchSize);
            await new Promise((resolve, reject) => {
                const tx = db.transaction('terms', 'readwrite');
                const store = tx.objectStore('terms');

                for (let j = 0; j < chunk.length; j++) {
                    const row = chunk[j];
                    store.add({
                        dictId: dictId,
                        term: (row[0] || '').toString(),
                        reading: (row[1] || '').toString(),
                        defTags: row[2] || '',
                        rules: row[3] || '',
                        score: typeof row[4] === 'number' ? row[4] : 0,
                        glossary: Array.isArray(row[5]) ? row[5] : [row[5]],
                        seq: row[6] || 0,
                        termTags: row[7] || ''
                    });
                }

                tx.oncomplete = () => resolve();
                tx.onerror = (e) => reject(e.target.error);
            });
        }
    }

    /**
     * Delete a dictionary and cascade remove all related terms
     */
    async deleteDictionary(dictId, onProgress) {
        const db = await this.open();

        // 1. Delete metadata
        await new Promise((resolve, reject) => {
            const tx = db.transaction('dictionaries', 'readwrite');
            const req = tx.objectStore('dictionaries').delete(dictId);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });

        // 2. Cascade delete from terms
        return new Promise((resolve, reject) => {
            const tx = db.transaction('terms', 'readwrite');
            const store = tx.objectStore('terms');
            const index = store.index('dictId');
            const range = IDBKeyRange.only(dictId);
            const req = index.openKeyCursor(range);

            let deletedCount = 0;
            req.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    store.delete(cursor.primaryKey);
                    deletedCount++;
                    if (deletedCount % 2000 === 0 && onProgress) {
                        onProgress(deletedCount);
                    }
                    cursor.continue();
                } else {
                    if (onProgress) onProgress(deletedCount);
                    resolve(deletedCount);
                }
            };

            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Query terms by exact term string
     */
    async getTermsByTerm(term) {
        const db = await this.open();
        return new Promise((resolve, reject) => {
            const tx = db.transaction('terms', 'readonly');
            const store = tx.objectStore('terms');
            const index = store.index('term');
            const req = index.getAll(term);
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
        });
    }

    /**
     * Query all custom CSS from active dictionaries
     */
    async getActiveStyles() {
        const dicts = await this.getDictionaries();
        return dicts
            .filter(d => d.enabled && d.css)
            .map(d => `/* Dictionary: ${d.title} */\n${d.css}`)
            .join('\n\n');
    }

    /**
     * Clear all dictionary data, terms, and web storage
     */
    async clearAllStorage() {
        try {
            if (this.db) {
                this.db.close();
                this.db = null;
            }
            await new Promise((resolve, reject) => {
                const req = indexedDB.deleteDatabase(this.dbName);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
                req.onblocked = () => resolve();
            });
            try { localStorage.clear(); } catch (e) {}
            try { sessionStorage.clear(); } catch (e) {}
            return true;
        } catch (e) {
            console.error('[clearAllStorage error]', e);
            throw e;
        }
    }
}

window.KikiDictDB = KikiDictDB;
