/**
 * Multi-Language Search Engine (English Lemmatizer + Japanese Deinflector + Yomitan Redirect Resolver)
 */
class KikiSearchEngine {
    constructor(db, deinflector, englishLemmatizer) {
        this.db = db;
        this.deinflector = deinflector;
        this.englishLemmatizer = englishLemmatizer;
        this.dictCache = null;
    }

    async refreshDictCache() {
        const dicts = await this.db.getDictionaries();
        const map = new Map();
        for (const d of dicts) {
            map.set(d.id, d);
        }
        this.dictCache = map;
        return map;
    }

    /**
     * Check if a glossary entry is a Yomitan redirect pointer: ["targetTerm", ["redirect"]]
     * @param {Object} entry 
     * @returns {string|null} Target term if redirect, else null
     */
    static getRedirectTarget(entry) {
        if (!entry || !Array.isArray(entry.glossary) || entry.glossary.length === 0) {
            return null;
        }

        const firstItem = entry.glossary[0];
        // Yomitan redirect format: [targetTerm, [tag1, tag2...]]
        if (Array.isArray(firstItem) && typeof firstItem[0] === 'string' && firstItem.length >= 2) {
            const tags = firstItem[1];
            if (Array.isArray(tags)) {
                if (tags.includes('redirect') || tags.includes('see') || (entry.defTags && entry.defTags.includes('non-lemma'))) {
                    return firstItem[0];
                }
            }
        }
        return null;
    }

    /**
     * Look up word or phrase with morphological reduction and redirect resolution
     * @param {string} text Target term or phrase to search
     * @returns {Promise<Array>} List of resolved entries with full rich content
     */
    async search(text) {
        if (!text || typeof text !== 'string') return [];
        const cleanText = text.trim();
        if (!cleanText) return [];

        if (!this.dictCache) {
            await this.refreshDictCache();
        }

        const enabledDicts = new Map();
        for (const [id, dict] of this.dictCache.entries()) {
            if (dict.enabled) {
                enabledDicts.set(id, dict);
            }
        }

        if (enabledDicts.size === 0) {
            return [];
        }

        // Generate candidate terms
        const candidates = [];
        const seenCandidates = new Set();

        const addCandidate = (term, reason = '', rules = 0, isOriginal = false) => {
            if (!term) return;
            const key = `${term.toLowerCase()}:${rules}`;
            if (!seenCandidates.has(key)) {
                seenCandidates.add(key);
                candidates.push({ term, reason, rules, isOriginal });
            }
        };

        // 1. Exact raw text
        addCandidate(cleanText, '', 0, true);

        // 2. Phrase normalization (space <-> hyphen, and collapsed)
        if (cleanText.includes(' ')) {
            addCandidate(cleanText.replace(/\s+/g, '-'), 'hyphenated', 0, false);
            addCandidate(cleanText.replace(/\s+/g, ''), 'collapsed', 0, false);
        } else if (cleanText.includes('-')) {
            addCandidate(cleanText.replace(/-/g, ' '), 'spaced', 0, false);
            addCandidate(cleanText.replace(/-/g, ''), 'collapsed', 0, false);
        }

        // 3. English Lemmatization (if English characters present)
        if (this.englishLemmatizer && /[a-zA-Z]/.test(cleanText)) {
            const lemmatized = this.englishLemmatizer.lemmatize(cleanText);
            for (const item of lemmatized) {
                addCandidate(item.term, item.reason === 'exact' ? '' : item.reason, 0, item.reason === 'exact');
            }
        }

        // 4. Japanese Deinflection (if Kana/Kanji present)
        if (this.deinflector && /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(cleanText)) {
            const deinflections = this.deinflector.deinflect(cleanText);
            for (const item of deinflections) {
                addCandidate(item.term, (item.reasons || []).join(' ← '), item.rules || 0, !item.reasons || item.reasons.length === 0);
            }
        }

        // 5. Query IndexedDB for all candidates concurrently
        const queries = candidates.map(c => this.db.getTermsByTerm(c.term));
        const lowerQueries = candidates.map(c => {
            const lower = c.term.toLowerCase();
            return lower !== c.term ? this.db.getTermsByTerm(lower) : Promise.resolve([]);
        });

        const [resultsExact, resultsLower] = await Promise.all([
            Promise.all(queries),
            Promise.all(lowerQueries)
        ]);

        const rawResults = [];
        const seenKeys = new Set();

        for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            const entries = [...resultsExact[i], ...resultsLower[i]];

            for (const entry of entries) {
                const dict = enabledDicts.get(entry.dictId);
                if (!dict) continue;

                // Validate Japanese inflection rule constraints
                if (candidate.rules !== 0 && entry.rules) {
                    const entryRuleList = entry.rules.split(/\s+/).filter(Boolean);
                    const entryFlags = Deinflector.rulesToRuleFlags(entryRuleList);
                    if ((entryFlags & candidate.rules) === 0) {
                        continue;
                    }
                }

                // Unique key: dictId + term + reading + seq + defTags
                const uniqueKey = `${entry.dictId}:${entry.term.toLowerCase()}:${entry.reading}:${entry.seq || ''}:${entry.defTags || ''}`;
                if (seenKeys.has(uniqueKey)) continue;
                seenKeys.add(uniqueKey);

                rawResults.push({
                    term: entry.term,
                    reading: entry.reading,
                    source: cleanText,
                    reason: candidate.reason,
                    isOriginal: candidate.isOriginal,
                    score: entry.score || 0,
                    glossary: entry.glossary || [],
                    defTags: entry.defTags || '',
                    rules: entry.rules || '',
                    seq: entry.seq || 0,
                    dictId: entry.dictId,
                    dictTitle: dict.title,
                    redirectTo: null
                });
            }
        }

        // 6. Resolve Yomitan Redirects (e.g. "good night" -> "goodnight", "take care of" -> "take care of somebody...")
        const finalResults = [];
        const redirectPromises = [];

        for (const item of rawResults) {
            const targetTerm = KikiSearchEngine.getRedirectTarget(item);
            if (!targetTerm) {
                finalResults.push(item);
            } else {
                // Fetch target lemma from IndexedDB
                redirectPromises.push(
                    this._resolveRedirect(targetTerm, item, enabledDicts)
                );
            }
        }

        if (redirectPromises.length > 0) {
            const resolvedRedirects = await Promise.all(redirectPromises);
            for (const list of resolvedRedirects) {
                finalResults.push(...list);
            }
        }

        // 7. Ranking: exact matches first, non-redirects over redirects, score descending
        finalResults.sort((a, b) => {
            if (a.isOriginal !== b.isOriginal) {
                return a.isOriginal ? -1 : 1;
            }
            if (a.term.toLowerCase() === cleanText.toLowerCase() && b.term.toLowerCase() !== cleanText.toLowerCase()) {
                return -1;
            }
            if (b.term.toLowerCase() === cleanText.toLowerCase() && a.term.toLowerCase() !== cleanText.toLowerCase()) {
                return 1;
            }
            return (b.score || 0) - (a.score || 0);
        });

        return finalResults;
    }

    /**
     * Resolve redirect target entry
     */
    async _resolveRedirect(targetTerm, originalItem, enabledDicts) {
        // Query target in DB
        let targets = await this.db.getTermsByTerm(targetTerm);
        if (targets.length === 0 && targetTerm !== targetTerm.toLowerCase()) {
            targets = await this.db.getTermsByTerm(targetTerm.toLowerCase());
        }

        // If target not directly found and has slashes/brackets, try base head
        if (targets.length === 0 && /[/(]/.test(targetTerm)) {
            const stripped = targetTerm.replace(/\s*\(.*?\)/g, '').replace(/\/.*$/, '').trim();
            if (stripped) {
                targets = await this.db.getTermsByTerm(stripped);
            }
        }

        const dict = enabledDicts.get(originalItem.dictId);
        const resolvedList = [];

        for (const target of targets) {
            if (target.dictId !== originalItem.dictId) continue;
            // Avoid circular redirect
            if (KikiSearchEngine.getRedirectTarget(target)) continue;

            resolvedList.push({
                term: originalItem.term,
                reading: target.reading || originalItem.reading,
                source: originalItem.source,
                reason: originalItem.reason,
                isOriginal: originalItem.isOriginal,
                score: (target.score || 0) + 1,
                glossary: target.glossary || [],
                defTags: target.defTags || originalItem.defTags,
                rules: target.rules || originalItem.rules,
                seq: target.seq || originalItem.seq,
                dictId: originalItem.dictId,
                dictTitle: dict ? dict.title : originalItem.dictTitle,
                redirectTo: target.term
            });
        }

        // If target resolution succeeded, return resolved definitions
        if (resolvedList.length > 0) {
            return resolvedList;
        }

        // Fallback: keep original if target lemma not in dictionary
        return [originalItem];
    }
}

window.KikiSearchEngine = KikiSearchEngine;
