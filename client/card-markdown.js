(function(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(require('./lib/marked.min.js'));
    } else {
        root.renderCardMarkdown = factory(root.marked);
    }
}(this, function(marked) {
    function normalizeBaseUrl(value) {
        if (!value || !value.trim()) {
            return '';
        }
        var url = new URL(value.trim());
        if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) {
            throw new Error('Jira URL must be an HTTP(S) base URL without credentials, query or fragment');
        }
        return url.href.replace(/\/+$/, '');
    }

    function escapeAttribute(value) {
        return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function renderCardMarkdown(text, baseUrl) {
        baseUrl = normalizeBaseUrl(baseUrl);
        if (!baseUrl) {
            return marked(text);
        }
        var tokens = marked.lexer(text);
        var excludedTags = [];

        function linkTokens(items) {
            var result = [];
            items.forEach(function(token) {
                // Raw HTML links and code blocks must also keep their contents intact.
                if (token.type === 'html') {
                    token.text.replace(/<\s*(\/?)\s*(a|code|pre|script|style|textarea)\b[^>]*>/gi,
                        function(tag, closing, name) {
                            name = name.toLowerCase();
                            if (closing) {
                                if (excludedTags[excludedTags.length - 1] === name) {
                                    excludedTags.pop();
                                }
                            } else if (!/\/\s*>$/.test(tag)) {
                                excludedTags.push(name);
                            }
                            return tag;
                        });
                } else if (token.type !== 'link' && token.type !== 'image' &&
                           token.type !== 'code' && token.type !== 'codespan' && !excludedTags.length) {
                    if (token.type === 'table') {
                        token.tokens.header = token.tokens.header.map(linkTokens);
                        token.tokens.cells = token.tokens.cells.map(function(row) {
                            return row.map(linkTokens);
                        });
                    } else if (token.tokens) {
                        token.tokens = linkTokens(token.tokens);
                    } else if (token.type === 'text') {
                        var pattern = /\b[A-Z][A-Z0-9_]*-[0-9]+\b/g;
                        var start = 0;
                        var match;
                        while ((match = pattern.exec(token.text))) {
                            // Do not turn a fragment of another identifier into a reference.
                            if ((match.index && /[\w-]/.test(token.text.charAt(match.index - 1))) ||
                                /[\w-]/.test(token.text.charAt(pattern.lastIndex))) {
                                continue;
                            }
                            result.push({type: 'text', text: token.text.slice(start, match.index)});
                            result.push({type: 'html', text: '<a class="jira-reference" href="' +
                                escapeAttribute(baseUrl + '/browse/' + match[0]) +
                                '" target="_blank" rel="noopener noreferrer">' + match[0] + '</a>'});
                            start = pattern.lastIndex;
                        }
                        if (start) {
                            result.push({type: 'text', text: token.text.slice(start)});
                            return;
                        }
                    }
                    if (token.items) {
                        token.items.forEach(function(item) { item.tokens = linkTokens(item.tokens); });
                    }
                }
                result.push(token);
            });
            return result;
        }

        var linked = linkTokens(tokens);
        linked.links = tokens.links;
        return marked.parser(linked);
    }

    renderCardMarkdown.normalizeBaseUrl = normalizeBaseUrl;
    return renderCardMarkdown;
}));
