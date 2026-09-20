/**
 * Kiki Immersion - Standalone Yomitan Structured Content Renderer
 * Converts Yomitan JSON structured-content format into semantic HTML DOM nodes.
 */
class KikiStructuredContent {
    /**
     * Render structured-content to an HTMLElement
     * @param {*} content Yomitan structured content node, string, or array
     * @returns {HTMLElement|DocumentFragment|Text}
     */
    static render(content) {
        if (typeof content === 'string') {
            return document.createTextNode(content);
        }

        if (Array.isArray(content)) {
            const fragment = document.createDocumentFragment();
            for (const item of content) {
                fragment.appendChild(this.render(item));
            }
            return fragment;
        }

        if (!content || typeof content !== 'object') {
            return document.createTextNode('');
        }

        // Handle wrapper object { type: 'structured-content', content: ... }
        if (content.type === 'structured-content' && content.content) {
            return this.render(content.content);
        }

        const tag = content.tag;
        if (!tag) {
            return document.createTextNode('');
        }

        // Allowed valid HTML tags in Yomitan specification
        const validTags = new Set([
            'div', 'span', 'ol', 'ul', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
            'details', 'summary', 'ruby', 'rt', 'rp', 'br', 'img', 'a', 'p', 'b', 'i', 'strong', 'em'
        ]);

        const elementTag = validTags.has(tag) ? tag : 'span';
        const element = document.createElement(elementTag);

        // Add Yomitan class
        element.classList.add(`gloss-sc-${elementTag}`);

        // Set dataset / attributes (crucial for [data-sc-class="..."] selector matching)
        if (content.data && typeof content.data === 'object') {
            for (const [key, value] of Object.entries(content.data)) {
                if (value !== undefined && value !== null) {
                    // Both dataset and explicit attribute for maximum CSS compatibility
                    const attrName = `data-sc-${key.replace(/([A-Z])/g, '-$1').toLowerCase()}`;
                    element.setAttribute(attrName, String(value));
                    
                    // Also set regular class if data has class
                    if (key === 'class') {
                        const classNames = String(value).split(/\s+/).filter(Boolean);
                        classNames.forEach(c => element.classList.add(c));
                    }
                }
            }
        }

        // Set lang
        if (content.lang) {
            element.lang = content.lang;
        }

        // Set title
        if (content.title) {
            element.title = content.title;
        }

        // Set open attribute for details
        if (content.open) {
            element.setAttribute('open', '');
        }

        // Set table cell spanning
        if (elementTag === 'th' || elementTag === 'td') {
            if (typeof content.colSpan === 'number') element.colSpan = content.colSpan;
            if (typeof content.rowSpan === 'number') element.rowSpan = content.rowSpan;
        }

        // Set inline styles from style object
        if (content.style && typeof content.style === 'object') {
            for (const [prop, val] of Object.entries(content.style)) {
                try {
                    element.style[prop] = val;
                } catch (e) {
                    // Ignore invalid CSS properties
                }
            }
        }

        // Append children
        if (content.content !== undefined) {
            element.appendChild(this.render(content.content));
        }

        return element;
    }
}

window.KikiStructuredContent = KikiStructuredContent;
