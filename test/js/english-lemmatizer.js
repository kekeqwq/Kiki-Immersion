/**
 * Lightweight English Lemmatizer for Kiki Immersion
 * Handles plural nouns, verb conjugations (-ed, -ing, -s), and common irregular verbs.
 */
class EnglishLemmatizer {
    constructor() {
        this.irregulars = new Map([
            // Common irregular verbs: [form, base, reason]
            ['am', 'be'], ['is', 'be'], ['are', 'be'], ['was', 'be'], ['were', 'be'], ['been', 'be'], ['being', 'be'],
            ['has', 'have'], ['had', 'have'], ['having', 'have'],
            ['does', 'do'], ['did', 'do'], ['done', 'do'], ['doing', 'do'],
            ['goes', 'go'], ['went', 'go'], ['gone', 'go'], ['going', 'go'],
            ['says', 'say'], ['said', 'say'],
            ['makes', 'make'], ['made', 'make'],
            ['knows', 'know'], ['knew', 'know'], ['known', 'know'],
            ['thinks', 'think'], ['thought', 'think'],
            ['takes', 'take'], ['took', 'take'], ['taken', 'take'],
            ['sees', 'see'], ['saw', 'see'], ['seen', 'see'],
            ['comes', 'come'], ['came', 'come'],
            ['finds', 'find'], ['found', 'find'],
            ['gives', 'give'], ['gave', 'give'], ['given', 'give'],
            ['tells', 'tell'], ['told', 'tell'],
            ['feels', 'feel'], ['felt', 'feel'],
            ['becomes', 'become'], ['became', 'become'],
            ['leaves', 'leave'], ['left', 'leave'],
            ['puts', 'put'],
            ['means', 'mean'], ['meant', 'mean'],
            ['keeps', 'keep'], ['kept', 'keep'],
            ['lets', 'let'],
            ['begins', 'begin'], ['began', 'begin'], ['begun', 'begin'],
            ['seems', 'seem'],
            ['helps', 'help'],
            ['shows', 'show'], ['showed', 'show'], ['shown', 'show'],
            ['hears', 'hear'], ['heard', 'hear'],
            ['plays', 'play'],
            ['runs', 'run'], ['ran', 'run'],
            ['moves', 'move'],
            ['likes', 'like'],
            ['lives', 'live'],
            ['believes', 'believe'],
            ['holds', 'hold'], ['held', 'hold'],
            ['brings', 'bring'], ['brought', 'bring'],
            ['happens', 'happen'],
            ['writes', 'write'], ['wrote', 'write'], ['written', 'write'],
            ['provides', 'provide'],
            ['sits', 'sit'], ['sat', 'sit'],
            ['stands', 'stand'], ['stood', 'stand'],
            ['loses', 'lose'], ['lost', 'lose'],
            ['pays', 'pay'], ['paid', 'pay'],
            ['meets', 'meet'], ['met', 'meet'],
            ['includes', 'include'],
            ['continues', 'continue'],
            ['sets', 'set'],
            ['learns', 'learn'], ['learnt', 'learn'],
            ['leads', 'lead'], ['led', 'lead'],
            ['understands', 'understand'], ['understood', 'understand'],
            ['watches', 'watch'],
            ['follows', 'follow'],
            ['stops', 'stop'],
            ['creates', 'create'],
            ['speaks', 'speak'], ['spoke', 'speak'], ['spoken', 'speak'],
            ['reads', 'read'],
            ['spends', 'spend'], ['spent', 'spend'],
            ['grows', 'grow'], ['grew', 'grow'], ['grown', 'grow'],
            ['opens', 'open'],
            ['walks', 'walk'],
            ['wins', 'win'], ['won', 'win'],
            ['offers', 'offer'],
            ['remembers', 'remember'],
            ['loves', 'love'],
            ['considers', 'consider'],
            ['appears', 'appear'],
            ['buys', 'buy'], ['bought', 'buy'],
            ['serves', 'serve'],
            ['dies', 'die'], ['died', 'die'], ['dying', 'die'],
            ['sends', 'send'], ['sent', 'send'],
            ['expects', 'expect'],
            ['builds', 'build'], ['built', 'build'],
            ['stays', 'stay'],
            ['falls', 'fall'], ['fell', 'fall'], ['fallen', 'fall'],
            ['cuts', 'cut'],
            ['reaches', 'reach'],
            ['kills', 'kill'],
            ['remains', 'remain'],
            ['eats', 'eat'], ['ate', 'eat'], ['eaten', 'eat'],
            ['drives', 'drive'], ['drove', 'drive'], ['driven', 'drive'],
            ['breaks', 'break'], ['broke', 'break'], ['broken', 'break'],
            ['chooses', 'choose'], ['chose', 'choose'], ['chosen', 'choose'],
            ['catches', 'catch'], ['caught', 'catch'],
            ['teaches', 'teach'], ['taught', 'teach'],
            ['sleeps', 'sleep'], ['slept', 'sleep'],
            ['drinks', 'drink'], ['drank', 'drink'], ['drunk', 'drink'],
            ['flies', 'fly'], ['flew', 'fly'], ['flown', 'fly'],
            ['swims', 'swim'], ['swam', 'swim'], ['swum', 'swim'],
            ['lies', 'lie'], ['lay', 'lie'], ['lain', 'lie'],
            ['wears', 'wear'], ['wore', 'wear'], ['worn', 'wear'],
            ['forgets', 'forget'], ['forgot', 'forget'], ['forgotten', 'forget'],
            ['bites', 'bite'], ['bit', 'bite'], ['bitten', 'bite'],
            ['hides', 'hide'], ['hid', 'hide'], ['hidden', 'hide'],
            ['rides', 'ride'], ['rode', 'ride'], ['ridden', 'ride'],
            ['shakes', 'shake'], ['shook', 'shake'], ['shaken', 'shake'],
            ['sings', 'sing'], ['sang', 'sing'], ['sung', 'sing'],
            ['rings', 'ring'], ['rang', 'ring'], ['rung', 'ring'],
            ['throws', 'throw'], ['threw', 'throw'], ['thrown', 'throw'],
            ['wakes', 'wake'], ['woke', 'wake'], ['woken', 'wake'],
            ['draws', 'draw'], ['drew', 'draw'], ['drawn', 'draw']
        ]);
    }

    /**
     * Lemmatize an English word
     * @param {string} rawWord
     * @returns {Array<{ term: string, reason: string }>}
     */
    lemmatize(rawWord) {
        if (!rawWord || typeof rawWord !== 'string') return [];
        const word = rawWord.toLowerCase().trim();
        if (!word) return [];

        const candidates = [];
        const seen = new Set();

        const add = (term, reason) => {
            if (term && term.length >= 2 && !seen.has(term)) {
                seen.add(term);
                candidates.push({ term, reason });
            }
        };

        // 1. Exact form
        add(word, 'exact');

        // Possessive 's / ’s (mom's -> mom, mums' -> mums)
        if (word.endsWith("'s") || word.endsWith("’s")) {
            add(word.slice(0, -2), 'possessive');
        }
        if (word.endsWith("'") || word.endsWith("’")) {
            add(word.slice(0, -1), 'possessive');
        }

        // 2. Irregular table lookup
        const irregularBase = this.irregulars.get(word);
        if (irregularBase) {
            add(irregularBase, 'irregular');
        }

        // 3. Regular rules
        // -ies -> -y (studies -> study, babies -> baby)
        if (word.endsWith('ies') && word.length > 4) {
            add(word.slice(0, -3) + 'y', 'plural/3sg');
        }

        // -es (boxes -> box, watches -> watch, passes -> pass)
        if (word.endsWith('es') && word.length > 3) {
            if (/(?:ch|sh|ss|x|z)es$/.test(word)) {
                add(word.slice(0, -2), 'plural/3sg');
            }
        }

        // -s (tests -> test, books -> book)
        if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) {
            add(word.slice(0, -1), 'plural/3sg');
        }

        // -ed (tested -> test, liked -> like, stopped -> stop, studied -> study)
        if (word.endsWith('ed') && word.length > 3) {
            if (word.endsWith('ied') && word.length > 4) {
                add(word.slice(0, -3) + 'y', 'past');
            }
            // stopped -> stop
            if (/([bdfgklmnprstz])\1ed$/.test(word)) {
                add(word.slice(0, -3), 'past');
            }
            // liked -> like
            add(word.slice(0, -1), 'past');
            // tested -> test
            add(word.slice(0, -2), 'past');
        }

        // -ing (testing -> test, taking -> take, running -> run)
        if (word.endsWith('ing') && word.length > 4) {
            // running -> run
            if (/([bdfgklmnprstz])\1ing$/.test(word)) {
                add(word.slice(0, -4), 'participle');
            }
            // taking -> take
            add(word.slice(0, -3) + 'e', 'participle');
            // testing -> test
            add(word.slice(0, -3), 'participle');
        }

        // -er / -est (faster -> fast, biggest -> big)
        if (word.endsWith('er') && word.length > 4) {
            add(word.slice(0, -2), 'comparative');
            add(word.slice(0, -1), 'comparative');
        }
        if (word.endsWith('est') && word.length > 5) {
            add(word.slice(0, -3), 'superlative');
            add(word.slice(0, -2), 'superlative');
        }

        return candidates;
    }
}

window.EnglishLemmatizer = EnglishLemmatizer;
