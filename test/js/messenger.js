/**
 * Cross-Origin Messenger for Kiki Immersion Hub (runs inside iframe)
 */
class KikiHubMessenger {
    constructor(searchEngine, db) {
        this.searchEngine = searchEngine;
        this.db = db;
        this.initListener();
    }

    initListener() {
        window.addEventListener('message', async (event) => {
            const data = event.data;
            if (!data || typeof data !== 'object' || !data.action) return;

            // Only process requests targeting the kiki namespace
            if (!data.action.startsWith('kiki:')) return;

            const { action, requestId } = data;

            try {
                if (action === 'kiki:ping') {
                    const dicts = await this.db.getDictionaries();
                    const styles = await this.db.getActiveStyles();
                    this.reply(event, {
                        action: 'kiki:pong',
                        requestId,
                        ready: true,
                        dictCount: dicts.filter(d => d.enabled).length,
                        styles: styles || ''
                    });
                } else if (action === 'kiki:lookup') {
                    const term = data.term || '';
                    const results = await this.searchEngine.search(term);
                    this.reply(event, {
                        action: 'kiki:lookupResult',
                        requestId,
                        term,
                        results
                    });
                } else if (action === 'kiki:getDicts') {
                    const dicts = await this.db.getDictionaries();
                    this.reply(event, {
                        action: 'kiki:dictsResult',
                        requestId,
                        dicts
                    });
                }
            } catch (error) {
                this.reply(event, {
                    action: 'kiki:error',
                    requestId,
                    error: error.message || String(error)
                });
            }
        });
    }

    reply(event, payload) {
        if (event.source && typeof event.source.postMessage === 'function') {
            event.source.postMessage(payload, event.origin === 'null' ? '*' : event.origin);
        }
    }
}

window.KikiHubMessenger = KikiHubMessenger;
