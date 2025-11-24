// IndexedDB utilities for caching ALL data including filter parameters
class MusicEventsDB {
    constructor() {
        this.dbName = 'MusicEventsDB';
        this.version = 4; // Incremented for new schema
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
                const transaction = event.target.transaction;
                
                // Core stores
                const stores = [
                    'events', 
                    'nodes', 
                    'links', 
                    'metadata',
                    // New stores for filter values
                    'composers',
                    'participants',
                    'cities',
                    'locations',
                    'instruments',
                    'event_types',
                    'cycles',
                    'organizations',
                    'ensembles',
                    'premiere_types',
                    'activities',
                    'genders'
                ];
                
                for (const storeName of stores) {
                    let store;
                    
                    if (!db.objectStoreNames.contains(storeName)) {
                        console.log(`DB: Creating ${storeName} object store`);
                        const keyPath = storeName === 'metadata' ? 'key' : 'id';
                        store = db.createObjectStore(storeName, { keyPath });
                    } else {
                        // Get existing store from the upgrade transaction
                        store = transaction.objectStore(storeName);
                    }
                    
                    // Create index for name search in filter stores (only if not exists)
                    if (!['events', 'nodes', 'links', 'metadata'].includes(storeName)) {
                        if (!store.indexNames.contains('name')) {
                            console.log(`DB: Creating 'name' index for ${storeName}`);
                            store.createIndex('name', 'name', { unique: false });
                        }
                    }
                }
            };
        });
    }

    async storeAllData(data) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        console.log('DB: Storing complete dataset...');
        
        try {
            // Store events
            if (data.events && data.events.length > 0) {
                const tx1 = this.db.transaction(['events'], 'readwrite');
                const eventsStore = tx1.objectStore('events');
                await this.clearStore(eventsStore);
                for (const event of data.events) {
                    if (event.id) {
                        await this.put(eventsStore, event);
                    }
                }
                await this.waitForTransaction(tx1);
                console.log(`DB: Stored ${data.events.length} events`);
            }

            // Store graph data
            if (data.nodes && data.nodes.length > 0) {
                const tx2 = this.db.transaction(['nodes'], 'readwrite');
                const nodesStore = tx2.objectStore('nodes');
                await this.clearStore(nodesStore);
                for (const node of data.nodes) {
                    if (node.id) {
                        await this.put(nodesStore, node);
                    }
                }
                await this.waitForTransaction(tx2);
                console.log(`DB: Stored ${data.nodes.length} nodes`);
            }

            if (data.links && data.links.length > 0) {
                const tx3 = this.db.transaction(['links'], 'readwrite');
                const linksStore = tx3.objectStore('links');
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
                await this.waitForTransaction(tx3);
                console.log(`DB: Stored ${data.links.length} links`);
            }

            // Store filter parameters
            if (data.params) {
                await this.storeFilterParams(data.params);
            }

            // Store timestamp
            const tx4 = this.db.transaction(['metadata'], 'readwrite');
            const metadataStore = tx4.objectStore('metadata');
            await this.put(metadataStore, { 
                key: 'lastUpdate', 
                value: data.timestamp || Date.now() 
            });
            await this.waitForTransaction(tx4);

            console.log('DB: All data storage complete');
        } catch (error) {
            console.error('DB: Error storing data:', error);
            throw error;
        }
    }

    waitForTransaction(transaction) {
        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(new Error('Transaction aborted'));
        });
    }

    async storeFilterParams(params, transaction = null) {
        console.log('DB: Storing filter parameters...');
        
        const filterStores = [
            'composers', 'participants', 'cities', 'locations',
            'instruments', 'event_types', 'cycles', 'organizations',
            'ensembles', 'premiere_types', 'activities', 'genders'
        ];

        // If no transaction provided, create one
        const shouldCreateTransaction = !transaction;
        if (shouldCreateTransaction) {
            if (!this.db) {
                throw new Error('Database not initialized');
            }
            transaction = this.db.transaction(filterStores, 'readwrite');
        }

        try {
            for (const storeName of filterStores) {
                if (params[storeName] && Array.isArray(params[storeName])) {
                    const store = transaction.objectStore(storeName);
                    await this.clearStore(store);
                    
                    for (const item of params[storeName]) {
                        if (item && item.name) {
                            await this.put(store, {
                                id: item.id || this.generateId(item.name),
                                name: item.name,
                                // Store any additional metadata
                                ...item
                            });
                        }
                    }
                    
                    console.log(`DB: Stored ${params[storeName].length} ${storeName}`);
                }
            }

            // Only handle transaction completion if we created it
            if (shouldCreateTransaction) {
                return new Promise((resolve, reject) => {
                    transaction.oncomplete = resolve;
                    transaction.onerror = () => reject(transaction.error);
                });
            }
        } catch (error) {
            console.error('DB: Error in storeFilterParams:', error);
            throw error;
        }
    }

    async getAllFilterParams() {
        if (!this.db) {
            return null;
        }

        try {
            const filterStores = [
                'composers', 'participants', 'cities', 'locations',
                'instruments', 'event_types', 'cycles', 'organizations',
                'ensembles', 'premiere_types', 'activities', 'genders'
            ];

            const params = {};
            
            for (const storeName of filterStores) {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                params[storeName] = await this.getAll(store);
            }

            console.log('DB: Retrieved all filter parameters:', 
                Object.keys(params).map(k => `${k}: ${params[k].length}`).join(', '));
            
            return params;
        } catch (error) {
            console.error('DB: Error getting filter params:', error);
            return null;
        }
    }

    async searchFilterValue(storeName, query) {
        if (!this.db) return [];
        
        try {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const index = store.index('name');
            
            const allItems = await this.getAll(store);
            const lowerQuery = query.toLowerCase();
            
            return allItems.filter(item => 
                item.name.toLowerCase().includes(lowerQuery)
            );
        } catch (error) {
            console.error(`DB: Error searching ${storeName}:`, error);
            return [];
        }
    }

    async getFilterValue(storeName, id) {
        if (!this.db) return null;
        
        try {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            return await this.get(store, id);
        } catch (error) {
            console.error(`DB: Error getting ${storeName} value:`, error);
            return null;
        }
    }

    async getAllEvents() {
        if (!this.db) return [];
        const transaction = this.db.transaction(['events'], 'readonly');
        const store = transaction.objectStore('events');
        return this.getAll(store);
    }

    async storeGraphData(nodes, links) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        const tx1 = this.db.transaction(['nodes'], 'readwrite');
        const nodesStore = tx1.objectStore('nodes');
        await this.clearStore(nodesStore);
        for (const node of nodes) {
            if (node.id) {
                await this.put(nodesStore, node);
            }
        }
        await this.waitForTransaction(tx1);

        const tx2 = this.db.transaction(['links'], 'readwrite');
        const linksStore = tx2.objectStore('links');
        await this.clearStore(linksStore);
        for (let i = 0; i < links.length; i++) {
            const link = links[i];
            await this.put(linksStore, { 
                id: `link_${i}`,
                source: link.source,
                target: link.target,
                label: link.label
            });
        }
        await this.waitForTransaction(tx2);
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
        
        const allStores = [
            'events', 'nodes', 'links', 'metadata',
            'composers', 'participants', 'cities', 'locations',
            'instruments', 'event_types', 'cycles', 'organizations',
            'ensembles', 'premiere_types', 'activities', 'genders'
        ];
        
        // Clear each store in separate transactions to avoid conflicts
        for (const storeName of allStores) {
            try {
                const transaction = this.db.transaction([storeName], 'readwrite');
                const store = transaction.objectStore(storeName);
                await this.clearStore(store);
                await this.waitForTransaction(transaction);
                console.log(`DB: Cleared ${storeName}`);
            } catch (error) {
                console.warn(`DB: Error clearing ${storeName}:`, error);
            }
        }
        
        console.log('DB: All data cleared');
    }

    async getStats() {
        if (!this.db) return null;
        
        try {
            const stats = {};
            const allStores = [
                'events', 'nodes', 'links',
                'composers', 'participants', 'cities', 'locations',
                'instruments', 'event_types', 'cycles', 'organizations',
                'ensembles', 'premiere_types', 'activities', 'genders'
            ];
            
            for (const storeName of allStores) {
                const transaction = this.db.transaction([storeName], 'readonly');
                const store = transaction.objectStore(storeName);
                const items = await this.getAll(store);
                stats[storeName] = items.length;
            }
            
            const lastUpdate = await this.getLastUpdate();
            stats.lastUpdate = lastUpdate;
            stats.isStale = await this.isDataStale();
            
            // Calculate human-readable size (approximate)
            const totalItems = Object.values(stats).reduce((sum, val) => 
                typeof val === 'number' ? sum + val : sum, 0
            );
            stats.totalItems = totalItems;
            stats.estimatedSizeMB = (totalItems * 500 / 1024 / 1024).toFixed(2); // Rough estimate
            
            return stats;
        } catch (error) {
            console.error('DB: Error getting stats:', error);
            return null;
        }
    }

    // Helper methods
    clearStore(store) {
        return new Promise((resolve, reject) => {
            try {
                const request = store.clear();
                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            } catch (error) {
                // If clear fails, try to manually delete all records
                console.warn('Clear failed, trying manual delete:', error);
                try {
                    const getAllRequest = store.getAllKeys();
                    getAllRequest.onsuccess = () => {
                        const keys = getAllRequest.result;
                        let deleteCount = 0;
                        
                        if (keys.length === 0) {
                            resolve();
                            return;
                        }
                        
                        keys.forEach(key => {
                            const deleteRequest = store.delete(key);
                            deleteRequest.onsuccess = () => {
                                deleteCount++;
                                if (deleteCount === keys.length) {
                                    resolve();
                                }
                            };
                            deleteRequest.onerror = () => reject(deleteRequest.error);
                        });
                    };
                    getAllRequest.onerror = () => reject(getAllRequest.error);
                } catch (innerError) {
                    reject(innerError);
                }
            }
        });
    }

    put(store, item) {
        return new Promise((resolve, reject) => {
            try {
                const request = store.put(item);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            } catch (error) {
                reject(error);
            }
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

    generateId(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return Math.abs(hash).toString();
    }
}

// Create singleton instance and expose globally
const dbInstance = new MusicEventsDB();

// Expose the class and instance globally
if (typeof window !== 'undefined') {
    window.MusicEventsDB = dbInstance; // Instance
    window.MusicEventsDBClass = MusicEventsDB; // Class if needed
}

// Export for use in modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = dbInstance;
}

// Auto-initialize when script loads
if (typeof window !== 'undefined') {
    console.log('DB: Singleton instance created and exposed as window.MusicEventsDB');
}