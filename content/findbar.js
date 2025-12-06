/*
 * Searchlight - Script to perform searching and highlighting.
 */ 
(function () {
    'use strict';

    // Prevent double loading
    if (window.__searchlightLoaded) return;
    window.__searchlightLoaded = true;
    console.log('[Searchlight] Initializing...');

    // State
    let findBar = null;
    let isVisible = false;
    let highlights = [];
    let currentIndex = -1;
    let settings = { caseSensitive: false, useRegex: false, useProximity: false, proximityDistance: 150 };

    // Tags to skip when searching
    const SKIP_TAGS = ['SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED', 'SVG', 'TEMPLATE'];


    // === KEYBOARD HANDLING ===

    function handleKeyDown(e) {
        const isCtrlF = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f';
        
        if (isCtrlF) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            showFindBar();
            return false;
        }
        
        if (e.key === 'Escape' && isVisible) {
            e.preventDefault();
            e.stopPropagation();
            hideFindBar();
            return false;
        }
    }

    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('keydown', handleKeyDown, true);

    // === FIND BAR UI ===

    function createFindBar() {
        const bar = document.createElement('div');
        bar.id = 'searchlight-findbar';
        
        bar.innerHTML = `
            <div class="findbar-container">
                <div class="findbar-input-container">
                    <input type="text" id="searchlight-findbar-input" class="findbar-textbox"
                           placeholder="Find in page" autocomplete="off" spellcheck="false" />
                    <span id="searchlight-findbar-status" class="findbar-status"></span>
                </div>
                
                <div class="findbar-buttons">
                    <button id="searchlight-findbar-prev" class="findbar-button" title="Previous (Shift+Enter)">
                        <svg viewBox="0 0 16 16" width="16" height="16">
                            <path d="M8 4l4 4H4z" fill="currentColor"/>
                        </svg>
                    </button>
                    <button id="searchlight-findbar-next" class="findbar-button" title="Next (Enter)">
                        <svg viewBox="0 0 16 16" width="16" height="16">
                            <path d="M8 12l4-4H4z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>
                
                <div class="findbar-separator"></div>
                
                <div class="findbar-options">
                    <label class="findbar-checkbox-label" title="Match Case">
                        <input type="checkbox" id="searchlight-findbar-case" />
                        <span>Match Case</span>
                    </label>
                    <label class="findbar-checkbox-label" title="Regular Expression">
                        <input type="checkbox" id="searchlight-findbar-regex" />
                        <span>Regex</span>
                    </label>
                    <div class="findbar-proximity-group">
                        <label class="findbar-checkbox-label" title="Proximity Search - find words within N characters of each other">
                            <input type="checkbox" id="searchlight-findbar-proximity" />
                            <span>Proximity</span>
                        </label>
                        <input type="number" id="searchlight-findbar-proximity-value" 
                               class="findbar-proximity-input" value="150" min="1" max="10000" disabled 
                               title="Maximum character distance between words" />
                    </div>
                </div>
                
                <button id="searchlight-findbar-close" class="findbar-button findbar-close" title="Close (Esc)">
                    <svg viewBox="0 0 16 16" width="16" height="16">
                        <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.5" fill="none"/>
                    </svg>
                </button>
            </div>
        `;
        
        document.documentElement.appendChild(bar);
        setupEventListeners(bar);
        return bar;
    }

    function setupEventListeners(bar) {
        const input = bar.querySelector('#searchlight-findbar-input');
        const caseCheckbox = bar.querySelector('#searchlight-findbar-case');
        const regexCheckbox = bar.querySelector('#searchlight-findbar-regex');
        const proximityCheckbox = bar.querySelector('#searchlight-findbar-proximity');
        const proximityInput = bar.querySelector('#searchlight-findbar-proximity-value');
        
        // Search as user types (debounced)
        let typingTimer;
        input.addEventListener('input', () => {
            clearTimeout(typingTimer);
            typingTimer = setTimeout(() => performSearch(input.value), 150);
        });
        
        // Keyboard shortcuts in input
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.shiftKey ? goToPreviousMatch() : goToNextMatch();
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                hideFindBar();
            }
            e.stopPropagation();
        });
        
        // Ctrl+F while focused just selects all
        input.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
                e.preventDefault();
                e.stopPropagation();
                input.select();
            }
        }, true);
        
        // Buttons
        bar.querySelector('#searchlight-findbar-prev').addEventListener('click', goToPreviousMatch);
        bar.querySelector('#searchlight-findbar-next').addEventListener('click', goToNextMatch);
        bar.querySelector('#searchlight-findbar-close').addEventListener('click', hideFindBar);
        
        // Case sensitivity checkbox
        caseCheckbox.addEventListener('change', () => {
            settings.caseSensitive = caseCheckbox.checked;
            saveSettings();
            performSearch(input.value);
        });
        
        // Regex checkbox
        regexCheckbox.addEventListener('change', () => {
            settings.useRegex = regexCheckbox.checked;
            // Disable proximity when regex is enabled (they're mutually exclusive)
            if (settings.useRegex && settings.useProximity) {
                settings.useProximity = false;
                proximityCheckbox.checked = false;
                proximityInput.disabled = true;
            }
            saveSettings();
            performSearch(input.value);
        });
        
        // Proximity checkbox
        proximityCheckbox.addEventListener('change', () => {
            settings.useProximity = proximityCheckbox.checked;
            proximityInput.disabled = !proximityCheckbox.checked;
            // Disable regex when proximity is enabled (they're mutually exclusive)
            if (settings.useProximity && settings.useRegex) {
                settings.useRegex = false;
                regexCheckbox.checked = false;
            }
            saveSettings();
            performSearch(input.value);
        });
        
        // Proximity distance input
        proximityInput.addEventListener('input', () => {
            const val = parseInt(proximityInput.value, 10);
            if (!isNaN(val) && val > 0) {
                settings.proximityDistance = val;
                saveSettings();
                performSearch(input.value);
            }
        });
        
        // Prevent clicks from affecting page
        bar.addEventListener('click', (e) => e.stopPropagation());
        bar.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    // === SHOW / HIDE ===

    function showFindBar() {
        if (!findBar) {
            findBar = createFindBar();
            loadSettings();
        }
        
        findBar.classList.add('visible');
        isVisible = true;
        
        const input = findBar.querySelector('#searchlight-findbar-input');
        
        // Use selected text as search term if any
        const selection = window.getSelection();
        if (selection && selection.toString().trim()) {
            input.value = selection.toString().trim();
        }
        
        setTimeout(() => {
            input.focus();
            input.select();
            if (input.value) performSearch(input.value);
        }, 10);
        
        console.log('[Searchlight] Opened');
    }

    function hideFindBar() {
        if (!findBar) return;
        findBar.classList.remove('visible');
        isVisible = false;
        clearHighlights();
        updateStatus('');
        console.log('[Searchlight] Closed');
    }


    // === SEARCH ===

    function performSearch(searchTerm) {
        clearHighlights();
        
        if (!searchTerm) {
            updateStatus('');
            return;
        }
        
        console.log('[Searchlight] Searching for:', searchTerm, 'Proximity:', settings.useProximity);
        
        let totalMatches = 0;
        
        if (settings.useProximity) {
            // Proximity search mode
            totalMatches = performProximitySearch(searchTerm);
        } else {
            // Standard regex/literal search
            let regex;
            try {
                if (settings.useRegex) {
                    regex = new RegExp(searchTerm, settings.caseSensitive ? 'gm' : 'gim');
                } else {
                    const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                    regex = new RegExp(escaped, settings.caseSensitive ? 'g' : 'gi');
                }
            } catch (err) {
                updateStatus('Invalid regex', true);
                return;
            }
            
            // Find and highlight matches
            for (const node of getVisibleTextNodes(document.body)) {
                const matches = findMatches(node.textContent, regex);
                if (matches.length > 0) {
                    highlightNode(node, matches);
                    totalMatches += matches.length;
                }
            }
        }
        
        highlights = Array.from(document.querySelectorAll('.searchlight-highlight'));
        
        if (totalMatches > 0) {
            currentIndex = 0;
            focusCurrentMatch();
            updateStatus(`1 of ${totalMatches}`);
        } else {
            updateStatus('No matches', true);
        }
        
        console.log('[Searchlight] Found', totalMatches, 'matches');
    }

    function performProximitySearch(searchTerm) {
        // Split search term into words
        const words = searchTerm.trim().split(/\s+/).filter(w => w.length > 0);
        
        if (words.length < 2) {
            // If only one word, fall back to standard search
            const escaped = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(escaped, settings.caseSensitive ? 'g' : 'gi');
            let totalMatches = 0;
            for (const node of getVisibleTextNodes(document.body)) {
                const matches = findMatches(node.textContent, regex);
                if (matches.length > 0) {
                    highlightNode(node, matches);
                    totalMatches += matches.length;
                }
            }
            return totalMatches;
        }
        
        const distance = settings.proximityDistance;
        let totalMatches = 0;
        
        // Build regexes for each word
        const wordRegexes = words.map(word => {
            const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return new RegExp(escaped, settings.caseSensitive ? 'g' : 'gi');
        });
        
        for (const node of getVisibleTextNodes(document.body)) {
            const text = node.textContent;
            
            // Find all positions of each word
            const wordPositions = wordRegexes.map(regex => {
                const positions = [];
                let match;
                regex.lastIndex = 0;
                while ((match = regex.exec(text)) !== null) {
                    positions.push({ start: match.index, end: match.index + match[0].length, text: match[0] });
                }
                return positions;
            });
            
            // Check if all words have at least one occurrence
            if (wordPositions.some(positions => positions.length === 0)) {
                continue;
            }
            
            // Find proximity matches - groups where all words appear within distance
            const proximityMatches = findProximityMatches(wordPositions, distance);
            
            if (proximityMatches.length > 0) {
                highlightNode(node, proximityMatches);
                totalMatches += proximityMatches.length;
            }
        }
        
        return totalMatches;
    }

    function findProximityMatches(wordPositions, distance) {
        const matches = [];
        const usedRanges = []; // Track matches
        
        // Position of first word as anchor
        for (const anchor of wordPositions[0]) {
            // Try to match all other words within distance of anchor
            const matchGroup = [anchor];
            let allFound = true;
            
            for (let i = 1; i < wordPositions.length; i++) {
                // Find the closest occurrence of word i within distance of anchor
                let bestMatch = null;
                let bestDist = Infinity;
                
                for (const pos of wordPositions[i]) {
                    const distFromAnchor = Math.min(
                        Math.abs(pos.start - anchor.end),
                        Math.abs(anchor.start - pos.end)
                    );
                    
                    if (distFromAnchor <= distance && distFromAnchor < bestDist) {
                        // Verify it's within distance of all previously found words
                        let withinAll = true;
                        for (const other of matchGroup) {
                            const distFromOther = Math.min(
                                Math.abs(pos.start - other.end),
                                Math.abs(other.start - pos.end)
                            );
                            if (distFromOther > distance) {
                                withinAll = false;
                                break;
                            }
                        }
                        
                        if (withinAll) {
                            bestMatch = pos;
                            bestDist = distFromAnchor;
                        }
                    }
                }
                
                if (bestMatch) {
                    matchGroup.push(bestMatch);
                } else {
                    allFound = false;
                    break;
                }
            }
            
            if (allFound && matchGroup.length === wordPositions.length) {
                // Create a match spanning from first to last word
                const starts = matchGroup.map(m => m.start);
                const ends = matchGroup.map(m => m.end);
                const minStart = Math.min(...starts);
                const maxEnd = Math.max(...ends);
                
                // Check if this range overlaps with existing matches
                const overlaps = usedRanges.some(range => 
                    !(maxEnd <= range.start || minStart >= range.end)
                );
                
                if (!overlaps) {
                    matches.push({
                        start: minStart,
                        length: maxEnd - minStart,
                        text: ''
                    });
                    usedRanges.push({ start: minStart, end: maxEnd });
                }
            }
        }
        
        // Sort matches by start position
        matches.sort((a, b) => a.start - b.start);
        
        return matches;
    }

    function findMatches(text, regex) {
        const matches = [];
        let match;
        regex.lastIndex = 0;
        
        while ((match = regex.exec(text)) !== null) {
            matches.push({ start: match.index, length: match[0].length, text: match[0] });
            if (match[0].length === 0) regex.lastIndex++; // Don't break if zero-length match
        }
        return matches;
    }


    // === TEXT NODE COLLECTION ===

    function getVisibleTextNodes(root) {
        const nodes = [];
        
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (node.parentElement?.closest('#searchlight-findbar')) return NodeFilter.FILTER_REJECT;
                
                const parent = node.parentElement;
                if (!parent) return NodeFilter.FILTER_REJECT;
                if (SKIP_TAGS.includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
                
                const style = window.getComputedStyle(parent);
                if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
                    return NodeFilter.FILTER_REJECT;
                }
                
                const rect = parent.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) return NodeFilter.FILTER_REJECT;
                if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
                
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        
        while (walker.nextNode()) nodes.push(walker.currentNode);
        return nodes;
    }


    // === HIGHLIGHTING ===

    function highlightNode(textNode, matches) {
        const text = textNode.textContent;
        const parent = textNode.parentNode;
        const fragment = document.createDocumentFragment();
        let lastEnd = 0;
        
        for (const match of matches) {
            // Text before match
            if (match.start > lastEnd) {
                fragment.appendChild(document.createTextNode(text.slice(lastEnd, match.start)));
            }
            // Highlighted match
            const mark = document.createElement('mark');
            mark.className = 'searchlight-highlight';
            mark.textContent = match.text || text.slice(match.start, match.start + match.length);
            fragment.appendChild(mark);
            lastEnd = match.start + match.length;
        }
        
        // Remaining text
        if (lastEnd < text.length) {
            fragment.appendChild(document.createTextNode(text.slice(lastEnd)));
        }
        
        parent.replaceChild(fragment, textNode);
    }

    function clearHighlights() {
        for (const mark of document.querySelectorAll('.searchlight-highlight')) {
            const parent = mark.parentNode;
            parent.replaceChild(document.createTextNode(mark.textContent), mark);
            parent.normalize();
        }
        highlights = [];
        currentIndex = -1;
    }


    // === NAVIGATION ===

    function goToNextMatch() {
        if (highlights.length === 0) return;
        if (highlights[currentIndex]) highlights[currentIndex].classList.remove('current');
        currentIndex = (currentIndex + 1) % highlights.length;
        focusCurrentMatch();
        updateStatus(`${currentIndex + 1} of ${highlights.length}`);
    }

    function goToPreviousMatch() {
        if (highlights.length === 0) return;
        if (highlights[currentIndex]) highlights[currentIndex].classList.remove('current');
        currentIndex = (currentIndex - 1 + highlights.length) % highlights.length;
        focusCurrentMatch();
        updateStatus(`${currentIndex + 1} of ${highlights.length}`);
    }

    function focusCurrentMatch() {
        const current = highlights[currentIndex];
        if (current) {
            current.classList.add('current');
            current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }


    // === STATUS ===

    function updateStatus(text, isError = false) {
        const status = document.querySelector('#searchlight-findbar-status');
        if (status) {
            status.textContent = text;
            status.classList.toggle('error', isError);
        }
    }


    // === SETTINGS ===

    function loadSettings() {
        browser.runtime.sendMessage({ action: 'getSettings' })
            .then(stored => {
                settings = { ...settings, ...stored };
                const caseCheckbox = document.querySelector('#searchlight-findbar-case');
                const regexCheckbox = document.querySelector('#searchlight-findbar-regex');
                const proximityCheckbox = document.querySelector('#searchlight-findbar-proximity');
                const proximityInput = document.querySelector('#searchlight-findbar-proximity-value');
                
                if (caseCheckbox) caseCheckbox.checked = settings.caseSensitive;
                if (regexCheckbox) regexCheckbox.checked = settings.useRegex;
                if (proximityCheckbox) proximityCheckbox.checked = settings.useProximity;
                if (proximityInput) {
                    proximityInput.value = settings.proximityDistance;
                    proximityInput.disabled = !settings.useProximity;
                }
                
                console.log('[Searchlight] Settings loaded:', settings);
            })
            .catch(err => console.log('[Searchlight] Could not load settings:', err));
    }

    function saveSettings() {
        browser.runtime.sendMessage({ action: 'saveSettings', settings })
            .catch(err => console.log('[Searchlight] Could not save settings:', err));
    }


    console.log('[Searchlight] Ready');
})();