// IndexedDB utilities for caching monthly data
class MusicEventsDB {
    constructor() {
        this.dbName = 'MusicEventsDB';
        this.version = 3; // Incremented for schema stability
        this.db = null;
    }

    async init() {
        console.log('DB: Initializing IndexedDB...');
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = (event) => {
                console.error('DB: Error opening database:', event.target.error);
                reject(event.target.error);
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('DB: Database opened successfully');
                resolve();
            };

            request.onupgradeneeded = (event) => {
                console.log('DB: Upgrading database schema...');
                const db = event.target.result;
                
                const stores = ['events', 'params', 'metadata', 'nodes', 'links'];
                for (const storeName of stores) {
                    if (!db.objectStoreNames.contains(storeName)) {
                        console.log(`DB: Creating ${storeName} object store`);
                        const keyPath = storeName === 'metadata' ? 'key' : 'id';
                        db.createObjectStore(storeName, { keyPath });
                    }
                }
            };
        });
    }

    async storeData(data) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const storeNames = ['events', 'params', 'metadata', 'nodes', 'links'];
        const transaction = this.db.transaction(storeNames, 'readwrite');

        try {
            // Store events
            if (data.events && data.events.length > 0) {
                const eventsStore = transaction.objectStore('events');
                await this.clearStore(eventsStore);
                for (const event of data.events) {
                    if (event.id) {
                        await this.put(eventsStore, event);
                    }
                }
                console.log(`DB: Stored ${data.events.length} events`);
            }

            // Store params
            if (data.params) {
                const paramsStore = transaction.objectStore('params');
                await this.put(paramsStore, { id: 'params', data: data.params });
            }

            // Store timestamp
            const metadataStore = transaction.objectStore('metadata');
            await this.put(metadataStore, { 
                key: 'lastUpdate', 
                value: data.timestamp || Date.now() 
            });

            // Store pre-processed graph data
            if (data.nodes && data.nodes.length > 0) {
                const nodesStore = transaction.objectStore('nodes');
                await this.clearStore(nodesStore);
                for (const node of data.nodes) {
                    if (node.id) {
                        await this.put(nodesStore, node);
                    }
                }
                console.log(`DB: Stored ${data.nodes.length} nodes`);
            }

            if (data.links && data.links.length > 0) {
                const linksStore = transaction.objectStore('links');
                await this.clearStore(linksStore);
                for (let i = 0; i < data.links.length; i++) {
                    const link = data.links[i];
                    await this.put(linksStore, { 
                        id: `link_${i}`, 
                        source: link.source,
                        target: link.target,
                        label: link.label
                    });
                }
                console.log(`DB: Stored ${data.links.length} links`);
            }

            return new Promise((resolve, reject) => {
                transaction.oncomplete = () => {
                    console.log('DB: Data storage complete');
                    resolve();
                };
                transaction.onerror = () => reject(transaction.error);
            });
        } catch (error) {
            console.error('DB: Error storing data:', error);
            throw error;
        }
    }

    async getAllEvents() {
        if (!this.db) return [];
        const transaction = this.db.transaction(['events'], 'readonly');
        const store = transaction.objectStore('events');
        return this.getAll(store);
    }

    async getParams() {
        if (!this.db) return null;
        const transaction = this.db.transaction(['params'], 'readonly');
        const store = transaction.objectStore('params');
        const result = await this.get(store, 'params');
        return result ? result.data : null;
    }

    async storeGraphData(nodes, links) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const transaction = this.db.transaction(['nodes', 'links'], 'readwrite');
        const nodesStore = transaction.objectStore('nodes');
        const linksStore = transaction.objectStore('links');

        await this.clearStore(nodesStore);
        await this.clearStore(linksStore);

        for (const node of nodes) {
            if (node.id) {
                await this.put(nodesStore, node);
            }
        }

        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            await this.put(linksStore, { 
                id: `link_${i}`,
                source: link.source,
                target: link.target,
                label: link.label
            });
        }

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getGraphData() {
        if (!this.db) {
            return { nodes: [], links: [] };
        }

        try {
            const transaction = this.db.transaction(['nodes', 'links'], 'readonly');
            const nodesStore = transaction.objectStore('nodes');
            const linksStore = transaction.objectStore('links');

            const nodes = await this.getAll(nodesStore);
            const rawLinks = await this.getAll(linksStore);

            // Clean links - remove storage ID
            const links = rawLinks.map(link => ({
                source: link.source,
                target: link.target,
                label: link.label
            }));

            console.log(`DB: Retrieved ${nodes.length} nodes and ${links.length} links`);
            return { nodes, links };
        } catch (error) {
            console.error('DB: Error getting graph data:', error);
            return { nodes: [], links: [] };
        }
    }

    async getLastUpdate() {
        if (!this.db) return null;
        try {
            const transaction = this.db.transaction(['metadata'], 'readonly');
            const store = transaction.objectStore('metadata');
            const result = await this.get(store, 'lastUpdate');
            return result ? result.value : null;
        } catch {
            return null;
        }
    }

    async isDataStale(maxAgeDays = 30) {
        const lastUpdate = await this.getLastUpdate();
        if (!lastUpdate) return true;
        const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000;
        return (Date.now() - lastUpdate) > maxAgeMs;
    }

    async clearAllData() {
        if (!this.db) return;
        
        const storeNames = ['events', 'params', 'metadata', 'nodes', 'links'];
        const transaction = this.db.transaction(storeNames, 'readwrite');
        
        for (const name of storeNames) {
            await this.clearStore(transaction.objectStore(name));
        }

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                console.log('DB: All data cleared');
                resolve();
            };
            transaction.onerror = () => reject(transaction.error);
        });
    }

    // Helper methods
    clearStore(store) {
        return new Promise((resolve, reject) => {
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    put(store, item) {
        return new Promise((resolve, reject) => {
            const request = store.put(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    get(store, key) {
        return new Promise((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    getAll(store) {
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result || []);
            request.onerror = () => reject(request.error);
        });
    }
}

const db = new MusicEventsDB();
export default db;