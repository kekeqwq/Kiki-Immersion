/**
 * Yomitan Zip Dictionary Importer for Kiki Immersion
 */
class YomitanImporter {
    constructor(db) {
        this.db = db;
    }

    /**
     * Parse and import Yomitan .zip dictionary file
     * @param {File|Blob} file Dictionary zip file
     * @param {Function} onProgress Progress callback ({ phase, current, total, percentage, message })
     */
    async importZip(file, onProgress = () => {}) {
        if (!window.JSZip) {
            throw new Error('JSZip library is not loaded');
        }

        onProgress({ phase: 'unzip', current: 0, total: 100, percentage: 0, message: 'Reading dictionary archive...' });

        const zip = new JSZip();
        const zipContent = await zip.loadAsync(file);

        // 1. Read index.json
        const indexFile = zipContent.file('index.json');
        if (!indexFile) {
            throw new Error('Invalid Yomitan dictionary: missing index.json');
        }

        const indexText = await indexFile.async('text');
        let meta;
        try {
            meta = JSON.parse(indexText);
        } catch (e) {
            throw new Error('Failed to parse index.json: ' + e.message);
        }

        // 2. Read custom CSS stylesheet if present (e.g. styles.css)
        let customCss = '';
        zipContent.forEach((relativePath, fileObj) => {
            if (relativePath.endsWith('.css')) {
                // Pick the main stylesheet
                if (!customCss || relativePath === 'styles.css') {
                    zipContent.file(relativePath).async('text').then(text => {
                        customCss = text;
                    });
                }
            }
        });
        // Await the CSS file if exists
        const cssFile = zipContent.file('styles.css') || zipContent.file(/.*\.css$/i)[0];
        if (cssFile) {
            customCss = await cssFile.async('text');
        }

        // Generate unique dictId
        const rawTitle = meta.title || 'Unknown Dictionary';
        const dictId = 'dict_' + rawTitle.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase() + '_' + Date.now().toString(36);

        // 3. Locate all term_bank_*.json files
        const bankFiles = [];
        zipContent.forEach((relativePath, fileObj) => {
            if (/^term_bank_\d+\.json$/.test(relativePath)) {
                bankFiles.push(fileObj);
            }
        });

        if (bankFiles.length === 0) {
            throw new Error('No term_bank_*.json files found in archive');
        }

        // Sort naturally: term_bank_1.json, term_bank_2.json ...
        bankFiles.sort((a, b) => {
            const numA = parseInt(a.name.match(/\d+/)[0], 10);
            const numB = parseInt(b.name.match(/\d+/)[0], 10);
            return numA - numB;
        });

        // 4. Save initial dictionary metadata
        const dictInfo = {
            id: dictId,
            title: meta.title || 'Untitled Dictionary',
            revision: meta.revision || '',
            format: meta.format || 3,
            sequenced: !!meta.sequenced,
            author: meta.author || '',
            description: meta.description || '',
            sourceLanguage: meta.sourceLanguage || '',
            targetLanguage: meta.targetLanguage || '',
            css: customCss,
            termCount: 0,
            enabled: true,
            createdAt: Date.now()
        };
        await this.db.saveDictionary(dictInfo);

        // 5. Stream banks and write in batches
        let totalImported = 0;
        const totalBanks = bankFiles.length;

        for (let i = 0; i < totalBanks; i++) {
            const bankFile = bankFiles[i];
            const bankPercentage = Math.round(((i) / totalBanks) * 100);

            onProgress({
                phase: 'import',
                current: i + 1,
                total: totalBanks,
                percentage: bankPercentage,
                message: `Importing chunk ${i + 1}/${totalBanks} (${bankFile.name})...`
            });

            const jsonStr = await bankFile.async('text');
            const entries = JSON.parse(jsonStr);

            if (Array.isArray(entries) && entries.length > 0) {
                await this.db.addTermsBatch(dictId, entries);
                totalImported += entries.length;
            }
        }

        // 6. Update final term count in metadata
        dictInfo.termCount = totalImported;
        await this.db.saveDictionary(dictInfo);

        onProgress({
            phase: 'done',
            current: totalBanks,
            total: totalBanks,
            percentage: 100,
            message: `Completed! Successfully indexed ${totalImported.toLocaleString()} entries.`
        });

        return dictInfo;
    }
}

window.YomitanImporter = YomitanImporter;
