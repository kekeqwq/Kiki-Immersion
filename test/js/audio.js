/**
 * Kiki Immersion - Yomitan Audio Engine
 * Supports multi-language audio playback (English, Japanese, etc.)
 * Fallback to Web Speech Synthesis API.
 */
class KikiAudioEngine {
    constructor() {
        this.currentAudio = null;
        this.autoPlay = true;
    }

    /**
     * Get audio stream URL for term and optional reading
     */
    getAudioUrl(term, reading = '', type = 2) {
        const cleanTerm = (term || '').trim();
        const cleanReading = (reading || '').trim();
        const isJp = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(cleanTerm);

        if (isJp) {
            if (cleanReading) {
                return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanReading)}&le=jap`;
            }
            return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanTerm)}&le=jap`;
        }

        // English audio: type=2 (US), type=1 (UK)
        return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(cleanTerm)}&type=${type}`;
    }

    /**
     * Play word pronunciation
     * @param {string} term 
     * @param {string} reading 
     * @param {number} type 1 for UK, 2 for US
     * @returns {Promise<boolean>}
     */
    play(term, reading = '', type = 2) {
        if (!term) return Promise.resolve(false);
        const cleanTerm = term.trim();

        return new Promise((resolve) => {
            try {
                if (this.currentAudio) {
                    this.currentAudio.pause();
                    this.currentAudio = null;
                }

                const url = this.getAudioUrl(cleanTerm, reading, type);
                const audio = new Audio(url);
                this.currentAudio = audio;

                audio.onended = () => resolve(true);
                audio.onerror = () => {
                    this.playSpeech(cleanTerm);
                    resolve(true);
                };

                const playPromise = audio.play();
                if (playPromise !== undefined) {
                    playPromise.catch(() => {
                        this.playSpeech(cleanTerm);
                        resolve(true);
                    });
                }
            } catch {
                this.playSpeech(cleanTerm);
                resolve(true);
            }
        });
    }

    /**
     * Native Web Speech API fallback
     */
    playSpeech(term) {
        try {
            if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
                const isJp = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(term);
                const utt = new SpeechSynthesisUtterance(term);
                utt.lang = isJp ? 'ja-JP' : 'en-US';
                utt.rate = 0.92;
                window.speechSynthesis.speak(utt);
            }
        } catch {}
    }
}

window.KikiAudioEngine = KikiAudioEngine;
