const fs = require('fs');
const path = require('path');

class WarframeDataParser {
    constructor() {
        this.primes = new Map();
        this.relics = new Map();
        this.currentSection = null;
        this.currentItem = null;
    }

    parse(content) {
        const lines = content.trim().split('\n').map(line => line.trim());

        lines.forEach(line => {
            if (!line) return;

            this.handleSectionHeaders(line) ||
                this.handlePrimeSection(line) ||
                this.handleRelicSection(line);
        });

        return {
            primes: Object.fromEntries(this.primes),
            relics: Object.fromEntries(this.relics)
        };
    }

    handleSectionHeaders(line) {
        const sections = {
            '# Primes': 'primes',
            '# Relics': 'relics'
        };

        if (sections[line]) {
            this.currentSection = sections[line];
            this.currentItem = null;
            return true;
        }
        return false;
    }

    handlePrimeSection(line) {
        if (this.currentSection !== 'primes') return false;

        // Handle main prime item line
        if (line.startsWith('- ') && !line.includes('->')) {
            const primeName = line.substring(2).trim();
            if (!primeName) return false;
            
            this.currentItem = primeName;
            this.primes.set(primeName, {
                name: primeName,
                parts: []
            });
            return true;
        }

        // Handle part line
        if (this.currentItem && (line.startsWith('  - ') || (line.startsWith('- ') && line.includes('->')))) {
            try {
                const partInfo = this.parsePartInfo(line);
                this.primes.get(this.currentItem).parts.push(partInfo);
                return true;
            } catch (error) {
                console.warn(`Warning: Couldn't parse part info in line: ${line}`);
                return false;
            }
        }

        return false;
    }

    handleRelicSection(line) {
        if (this.currentSection !== 'relics') return false;

        // Handle relic header
        if (line.startsWith('## ')) {
            const relicName = line.substring(3).trim();
            if (!relicName) return false;
            
            this.currentItem = relicName;
            this.relics.set(relicName, {
                location: '',
                rewards: []
            });
            return true;
        }

        if (!this.currentItem) return false;

        // Handle location line
        if (line.startsWith('**Location**:')) {
            const location = line.split(':').slice(1).join(':').trim();
            this.relics.get(this.currentItem).location = location;
            return true;
        }

        // Handle reward line
        if (line.startsWith('- ')) {
            try {
                const reward = this.parseRewardInfo(line);
                this.relics.get(this.currentItem).rewards.push(reward);
                return true;
            } catch (error) {
                console.warn(`Warning: Couldn't parse reward in line: ${line}`);
                return false;
            }
        }

        return false;
    }

    parsePartInfo(line) {
        const partLine = line.replace(/^[- ]+/, '');
        const parts = partLine.split('->').map(s => s.trim());
        
        if (parts.length < 2) {
            throw new Error(`Invalid part format: ${line}`);
        }
        
        const [partInfo, relicInfo] = parts;
        const [part, rarity] = this.parsePartAndRarity(partInfo);

        return {
            part: part || '',
            rarity: rarity || '',
            relic: relicInfo || ''
        };
    }

    parseRewardInfo(line) {
        const rewardLine = line.substring(2).trim();
        if (!rewardLine) {
            throw new Error(`Empty reward line: ${line}`);
        }
        
        const [part, rarity] = this.parsePartAndRarity(rewardLine);

        return {
            part: part || '',
            rarity: rarity || ''
        };
    }

    parsePartAndRarity(info) {
        if (!info) return ['', ''];
        
        const rarityMatch = info.match(/\(([^)]+)\)$/);
        let part = info;
        let rarity = '';
        
        if (rarityMatch) {
            rarity = rarityMatch[1].trim();
            part = info.substring(0, rarityMatch.index).trim();
        }
        
        return [part, rarity];
    }
}

class HTMLGenerator {
    static generateHTML(data) {
        const separated = this.separateWarframesWeapons(data.primes);
        data.primes = separated;

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="icon" href="https://i.imgur.com/DTf1jQO.png">
    <title>Warframe Prime Nexus</title>
    ${this.getStyles()}
    <link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700&family=Exo+2:wght@300;500;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="void-grid"></div>
    ${this.getTemplate()}
    ${this.getScript(data)}
</body>
</html>`;
    }

    static separateWarframesWeapons(primes) {
        const separated = { warframes: {}, weapons: {} };

        Object.entries(primes).forEach(([name, info]) => {
            // More robust check for warframes - they typically have Systems, Chassis, and Neuroptics
            const isWarframe = info.parts.some(part => 
                part.part.includes('Systems') || 
                part.part.includes('Chassis') || 
                part.part.includes('Neuroptics')
            );

            if (isWarframe) {
                separated.warframes[name] = info;
            } else {
                separated.weapons[name] = info;
            }
        });

        return separated;
    }

    static getStyles() {
        return `<style>
        :root {
            --void-primary: #4a69bd;
            --void-accent: #6c5ce7;
            --void-dark: #0a0a12;
            --void-surface: rgba(26, 26, 45, 0.9);
            --void-border: #2a2a4a;
            --void-text: #e0e0ff;
            --void-rare: #ff4757;
            --void-uncommon: #e67e22;
            --void-common: #7f8c8d;
            --void-glow: rgba(108, 92, 231, 0.3);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Exo 2', sans-serif;
        }

        body {
            background: var(--void-dark);
            color: var(--void-text);
            min-height: 100vh;
            line-height: 1.6;
            position: relative;
            overflow-x: hidden;
        }

        .void-grid {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background:
                linear-gradient(45deg, 
                    transparent 24%, 
                    var(--void-border) 25%, 
                    var(--void-border) 26%, 
                    transparent 27%),
                linear-gradient(-45deg, 
                    transparent 24%, 
                    var(--void-border) 25%, 
                    var(--void-border) 26%, 
                    transparent 27%);
            background-size: 40px 40px;
            opacity: 0.1;
            z-index: -1;
            animation: gridFlow 40s linear infinite;
        }

        .container {
            max-width: 1200px;
            margin: 0 auto;
            position: relative;
            padding: 2rem;
            backdrop-filter: blur(8px);
        }

        .header {
            text-align: center;
            padding: 3rem 0;
            position: relative;
            overflow: hidden;
            margin-bottom: 3rem;
        }

        .header::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 60%;
            height: 2px;
            background: linear-gradient(90deg, 
                transparent, 
                var(--void-primary), 
                transparent);
            animation: linePulse 2s infinite;
        }

        .header h1 {
            font-family: 'Orbitron', sans-serif;
            font-size: 2.5rem;
            text-transform: uppercase;
            letter-spacing: 4px;
            background: linear-gradient(45deg, #fff, var(--void-primary));
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            margin-bottom: 1rem;
            text-shadow: 0 0 15px var(--void-glow);
            animation: titleGlow 2s ease-in-out infinite alternate;
        }

        .search-container {
            margin: 2rem 0;
            position: relative;
        }

        .search-input {
            width: 100%;
            padding: 1.2rem 2rem;
            background: var(--void-surface);
            border: 2px solid var(--void-border);
            border-radius: 8px;
            color: var(--void-text);
            font-size: 1.1rem;
            transition: all 0.3s ease;
        }

        .search-input:focus {
            outline: none;
            border-color: var(--void-primary);
            box-shadow: 0 0 20px var(--void-glow);
        }

        .tab-container {
            display: flex;
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .tab-button {
            flex: 1;
            padding: 1rem;
            background: var(--void-surface);
            border: 1px solid var(--void-border);
            color: var(--void-text);
            cursor: pointer;
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            font-weight: 500;
        }

        .tab-button:hover {
            border-color: var(--void-primary);
        }

        .tab-button.active {
            background: var(--void-primary);
            border-color: var(--void-primary);
            box-shadow: 0 0 15px var(--void-glow);
        }

        .prime-item {
            background: var(--void-surface);
            border: 1px solid var(--void-border);
            border-radius: 8px;
            margin-bottom: 1rem;
            transition: all 0.3s ease;
            backdrop-filter: blur(4px);
        }

        .prime-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.3);
        }

        .prime-header {
            padding: 1.5rem;
            cursor: pointer;
            display: flex;
            justify-content: space-between;
            align-items: center;
            font-weight: 500;
        }

        .prime-header:hover {
            background: rgba(108, 92, 231, 0.05);
        }

        .prime-content {
            padding: 0 1.5rem 1.5rem;
            display: none;
            border-top: 1px solid var(--void-border);
        }

        .prime-content.active {
            display: block;
            animation: contentSlide 0.3s ease-out;
        }

        .part-list {
            list-style: none;
            padding: 0;
            margin: 0;
        }

        .part-item {
            padding: 1rem;
            margin: 0.5rem 0;
            background: rgba(255,255,255,0.03);
            border-radius: 6px;
            display: flex;
            align-items: center;
            gap: 1rem;
            transition: all 0.3s ease;
        }

        .part-item:hover {
            background: rgba(108, 92, 231, 0.1);
            transform: translateX(5px);
        }

        .rarity-Rare { color: var(--void-rare); }
        .rarity-Uncommon { color: var(--void-uncommon); }
        .rarity-Common { color: var(--void-common); }

        .relic-popup {
            position: fixed;
            right: 20px;
            top: 50%;
            transform: translateY(-50%);
            background: var(--void-surface);
            border: 1px solid var(--void-primary);
            border-radius: 8px;
            padding: 1.5rem;
            box-shadow: 0 0 30px var(--void-glow);
            z-index: 1000;
            width: 400px;
            max-height: 80vh;
            overflow-y: auto;
            backdrop-filter: blur(10px);
            animation: popupAppear 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            display: none;
        }

        .category-section {
            margin: 2rem 0;
            padding: 1rem;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            border: 1px solid var(--void-border);
        }

        .category-title {
            font-family: 'Orbitron', sans-serif;
            color: var(--void-primary);
            margin-bottom: 1rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--void-border);
            text-transform: uppercase;
            letter-spacing: 2px;
        }

        .relic-hover {
            cursor: pointer;
            position: relative;
            border-bottom: 1px dotted var(--void-primary);
            transition: all 0.2s ease;
        }

        .relic-hover:hover {
            color: var(--void-accent);
            border-bottom-color: var(--void-accent);
        }

        .relic-hover::after {
            content: 'ⓘ';
            margin-left: 5px;
            font-size: 0.8em;
            opacity: 0.7;
        }

        .no-results {
            padding: 2rem;
            text-align: center;
            font-style: italic;
            background: rgba(255,255,255,0.03);
            border-radius: 8px;
            margin: 2rem 0;
        }

        @keyframes gridFlow {
            0% { background-position: 0 0; }
            100% { background-position: 1000px 1000px; }
        }

        @keyframes linePulse {
            0% { opacity: 0.2; }
            50% { opacity: 1; }
            100% { opacity: 0.2; }
        }

        @keyframes titleGlow {
            from { text-shadow: 0 0 10px var(--void-glow); }
            to { text-shadow: 0 0 20px var(--void-glow); }
        }

        @keyframes contentSlide {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        @keyframes popupAppear {
            from { opacity: 0; transform: scale(0.95) translateY(-50%); }
            to { opacity: 1; transform: scale(1) translateY(-50%); }
        }

        @media (max-width: 768px) {
            body { padding: 1rem; }
            .header h1 { font-size: 2rem; }
            .prime-header { padding: 1rem; }
            .relic-popup {
                width: 90%;
                left: 50%;
                right: auto;
                transform: translate(-50%, -50%);
            }
        }
        </style>`;
    }

    static getTemplate() {
        return `
        <div class="container">
            <div class="header">
                <h1>Warframe Prime Nexus</h1>
                <p>Prime Tracking by Steins</p>
            </div>

            <div class="search-container">
                <input type="text" 
                    id="searchInput" 
                    class="search-input" 
                    placeholder="Scanning for primes..."
                    aria-label="Search input">
            </div>

            <div class="tab-container">
                <button class="tab-button active" data-tab="primes">Primes</button>
                <button class="tab-button" data-tab="relics">Relics</button>
            </div>

            <div id="mainContent"></div>
        </div>

        <div id="relicPopup" class="relic-popup"></div>`;
    }

    static getScript(data) {
        return `<script>
        const tierOrder = { Lith: 1, Meso: 2, Neo: 3, Axi: 4 };
        
        const state = {
            data: ${JSON.stringify(data)},
            currentTab: 'primes',
            expandedItems: new Set(),
            searchTerm: '',
            relicPopupVisible: false
        };

        const utils = {
            debounce(func, wait) {
                let timeout;
                return (...args) => {
                    clearTimeout(timeout);
                    timeout = setTimeout(() => func(...args), wait);
                };
            },

            sortRelics(relics) {
                return relics.sort((a, b) => {
                    const aTier = a.split(' ')[0];
                    const bTier = b.split(' ')[0];
                    
                    // Handle cases where the relic format doesn't match expected
                    const aTierValue = tierOrder[aTier] || 99;
                    const bTierValue = tierOrder[bTier] || 99;
                    
                    return aTierValue - bTierValue || a.localeCompare(b);
                });
            },

            groupParts(parts) {
                const grouped = new Map();
                
                parts.forEach(part => {
                    // Skip invalid parts
                    if (!part.part) return;
                    
                    const key = \`\${part.part}|\${part.rarity || ''}\`;
                    if (!grouped.has(key)) {
                        grouped.set(key, {
                            part: part.part,
                            rarity: part.rarity || '',
                            relics: []
                        });
                    }
                    
                    if (part.relic) {
                        grouped.get(key).relics.push(part.relic);
                    }
                });

                return Array.from(grouped.values()).map(group => ({
                    ...group,
                    relics: this.sortRelics([...new Set(group.relics.filter(Boolean))])
                }));
            },

            filterByCategory(items, term, category) {
                if (!term) {
                    return Object.entries(items[category] || {});
                }
                
                term = term.toLowerCase();
                return Object.entries(items[category] || {}).filter(([name, info]) => {
                    if (name.toLowerCase().includes(term)) return true;
                    return info.parts && info.parts.some(p => 
                        p.part && p.part.toLowerCase().includes(term) || 
                        (p.relic && p.relic.toLowerCase().includes(term))
                    );
                });
            },

            filterItems(items, term) {
                if (!term) {
                    return Object.entries(items || {});
                }
                
                term = term.toLowerCase();
                return Object.entries(items || {}).filter(([name, info]) => {
                    if (name.toLowerCase().includes(term)) return true;
                    
                    const parts = info.parts || info.rewards || [];
                    return parts.some(p => 
                        p.part && p.part.toLowerCase().includes(term) || 
                        (p.relic && p.relic.toLowerCase().includes(term))
                    );
                });
            },
            
            escapeHtml(unsafe) {
                return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
            }
        };

        const view = {
            renderPrimes(term) {
                const renderCategory = (category, title) => {
                    const filtered = utils.filterByCategory(state.data.primes, term, category);
                    if (!filtered.length) return '';
                    
                    return \`
                        <div class="category-section">
                            <h3 class="category-title">\${title}</h3>
                            \${filtered.map(([name, info]) => this.renderPrimeItem(name, info)).join('')}
                        </div>
                    \`;
                };

                const content = \`
                    \${renderCategory('warframes', 'Prime Warframes')}
                    \${renderCategory('weapons', 'Prime Weapons')}
                \`;
                
                return content || '<div class="no-results">No primes found matching your search</div>';
            },

            renderPrimeItem(name, info) {
                const escapedName = utils.escapeHtml(name);
                const groupedParts = utils.groupParts(info.parts || []);
                
                return \`
                    <div class="prime-item">
                        <div class="prime-header" onclick="controller.toggleItem('\${escapedName}')">
                            <span>\${escapedName}</span>
                            <span>\${state.expandedItems.has(name) ? '▼' : '▶'}</span>
                        </div>
                        <div class="prime-content \${state.expandedItems.has(name) ? 'active' : ''}">
                            <ul class="part-list">
                                \${groupedParts.map(p => \`
                                    <li class="part-item">
                                        <span class="rarity-\${p.rarity}">\${utils.escapeHtml(p.part)}</span>
                                        <span>→</span>
                                        <span class="part-link">
                                            \${p.relics.map(r => \`
                                                <span class="relic-hover"
                                                    onmouseover="controller.showRelicPopup('\${utils.escapeHtml(r)}')"
                                                    onmouseout="controller.hideRelicPopupWithDelay()">
                                                    \${utils.escapeHtml(r)}
                                                </span>
                                            \`).join(' > ')}
                                        </span>
                                    </li>
                                \`).join('')}
                            </ul>
                        </div>
                    </div>
                \`;
            },

            renderRelics(term) {
                const filtered = utils.filterItems(state.data.relics, term);
                if (!filtered.length) return '<div class="no-results">No relics found in current void cycle</div>';

                return filtered.map(([name, info]) => \`
                    <div class="prime-item">
                        <div class="prime-header" onclick="controller.toggleItem('\${utils.escapeHtml(name)}')">
                            <span>\${utils.escapeHtml(name)}</span>
                            <span>\${state.expandedItems.has(name) ? '▼' : '▶'}</span>
                        </div>
                        <div class="prime-content \${state.expandedItems.has(name) ? 'active' : ''}">
                            <div class="location">Void Location: \${utils.escapeHtml(info.location || 'Unknown')}</div>
                            <ul class="part-list">
                                \${(info.rewards || []).map(r => \`
                                    <li class="part-item">
                                        <span class="rarity-\${r.rarity}">\${utils.escapeHtml(r.part || '')}</span>
                                    </li>
                                \`).join('')}
                            </ul>
                        </div>
                    </div>
                \`).join('');
            },

            renderRelicPopup(relicName) {
                const relic = state.data.relics[relicName];
                if (!relic) return '<p>Relic information not found</p>';
                
                return \`
                    <h3>\${utils.escapeHtml(relicName)}</h3>
                    <div class="location">\${utils.escapeHtml(relic.location || 'Unknown location')}</div>
                    <ul class="part-list">
                        \${(relic.rewards || []).map(r => \`
                            <li class="part-item">
                                <span class="rarity-\${r.rarity}">\${utils.escapeHtml(r.part || '')}</span>
                            </li>
                        \`).join('')}
                    </ul>
                \`;
            },

            updateDisplay() {
                const content = state.currentTab === 'primes' 
                    ? this.renderPrimes(state.searchTerm)
                    : this.renderRelics(state.searchTerm);
                document.getElementById('mainContent').innerHTML = content;
            }
        };

        const controller = {
            init() {
                this.setupListeners();
                view.updateDisplay();
            },

            setupListeners() {
                document.getElementById('searchInput').addEventListener('input',
                    utils.debounce(e => {
                        state.searchTerm = e.target.value;
                        view.updateDisplay();
                    }, 300)
                );

                document.querySelectorAll('.tab-button').forEach(btn => {
                    btn.addEventListener('click', e => {
                        document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
                        e.target.classList.add('active');
                        state.currentTab = e.target.dataset.tab;
                        document.getElementById('searchInput').value = '';
                        state.searchTerm = '';
                        state.expandedItems.clear();
                        this.hideRelicPopup();
                        view.updateDisplay();
                    });
                });
                
                // Hide popup when clicking outside
                document.addEventListener('click', e => {
                    if (!e.target.closest('.relic-hover') && !e.target.closest('#relicPopup')) {
                        this.hideRelicPopup();
                    }
                });

                // Prevent popup hiding during mouseover
                document.getElementById('relicPopup').addEventListener('mouseover', () => {
                    clearTimeout(this.popupTimeout);
                    state.relicPopupVisible = true;
                });
                
                document.getElementById('relicPopup').addEventListener('mouseout', () => {
                    this.hideRelicPopupWithDelay();
                });
            },

            toggleItem(name) {
                state.expandedItems.has(name) 
                    ? state.expandedItems.delete(name)
                    : state.expandedItems.add(name);
                view.updateDisplay();
            },

            showRelicPopup(relicName) {
                clearTimeout(this.popupTimeout);
                state.relicPopupVisible = true;
                
                const popup = document.getElementById('relicPopup');
                popup.innerHTML = view.renderRelicPopup(relicName);
                popup.style.display = 'block';
            },
            
            hideRelicPopupWithDelay() {
                state.relicPopupVisible = false;
                this.popupTimeout = setTimeout(() => {
                    if (!state.relicPopupVisible) {
                        this.hideRelicPopup();
                    }
                }, 300);
            },

            hideRelicPopup() {
                clearTimeout(this.popupTimeout);
                state.relicPopupVisible = false;
                document.getElementById('relicPopup').style.display = 'none';
            },
            
            popupTimeout: null
        };

        document.addEventListener('DOMContentLoaded', () => controller.init());
        </script>`;
    }
}

class WarframeConverter {
    static async convertMarkdownToHTML(inputFile, outputFile) {
        try {
            // Resolve paths relative to current directory
            const inputPath = path.resolve(inputFile);
            const outputPath = path.resolve(outputFile);
            
            console.log(`Converting ${inputPath} to ${outputPath}...`);
            
            const content = await fs.promises.readFile(inputPath, 'utf8');
            const parsedData = new WarframeDataParser().parse(content);
            const html = HTMLGenerator.generateHTML(parsedData);
            
            await fs.promises.writeFile(outputPath, html);
            console.log(`Successfully generated ${outputPath}`);
            
            return { success: true, message: `Successfully generated ${outputPath}` };
        } catch (error) {
            console.error('Void translation failed:', error);
            
            if (error.code === 'ENOENT') {
                console.error(`File not found: ${error.path}`);
            }
            
            return { success: false, error: error.message };
        }
    }
}

if (require.main === module) {
    const inputFile = process.argv[2] || 'currentPrimes.md';
    const outputFile = process.argv[3] || 'index.html';
    
    WarframeConverter.convertMarkdownToHTML(inputFile, outputFile)
        .then(result => {
            if (!result.success) {
                process.exit(1);
            }
        })
        .catch(err => {
            console.error('Unexpected error:', err);
            process.exit(1);
        });
}

module.exports = {
    WarframeDataParser,
    HTMLGenerator,
    WarframeConverter
};