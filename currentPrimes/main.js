import fetch from 'node-fetch';
import { JSDOM } from 'jsdom';
import fs from 'fs';

/**
 * Fetches and parses HTML content from a URL
 * @param {string} url - The URL to fetch HTML from
 * @returns {Document|null} - Parsed DOM document or null on failure
 */
async function fetchAndParseHTML(url) {
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const htmlContent = await response.text();
        return new JSDOM(htmlContent).window.document;
    } catch (error) {
        console.error('Error fetching or parsing the HTML content:', error);
        return null;
    }
}

/**
 * Extracts relic names from a subtable
 * @param {Document} document - The DOM document
 * @param {string} subTableTitle - The title of the subtable to extract from
 * @returns {string[]} - Array of relic names
 */
function findSubTableData(document, subTableTitle) {
    const tables = document.querySelectorAll('th');
    let targetTableStart = Array.from(tables).find(th => th.textContent.trim() === subTableTitle);

    if (!targetTableStart) {
        console.error(`Subtable not found: ${subTableTitle}`);
        return [];
    }

    // Extract rows of the subtable
    let rows = [];
    let currentRow = targetTableStart.parentElement.nextElementSibling;

    while (currentRow && !currentRow.classList.contains('blank-row')) {
        const tdElement = currentRow.querySelector('td');
        if (!currentRow.querySelector('th') && tdElement && tdElement.textContent.includes("Relic")) {
            rows.push(tdElement.textContent.trim());
        }
        currentRow = currentRow.nextElementSibling;
    }

    return rows;
}

/**
 * Extracts reward data for a specific relic
 * @param {Document} document - The DOM document
 * @param {string} relicName - The name of the relic to extract rewards from
 * @returns {Array<{item: string, rarity: string}>} - Array of reward items with their rarity
 */
function findRelicTableData(document, relicName) {
    const tables = document.querySelectorAll('th');
    const searchName = `${relicName} (Intact)`;
    let targetTableStart = Array.from(tables).find(th => th.textContent.trim() === searchName);

    if (!targetTableStart) {
        console.error(`Relic table not found: ${searchName}`);
        return [];
    }

    // Extract rows of the relic table
    let rows = [];
    let currentRow = targetTableStart.parentElement.nextElementSibling;

    while (currentRow && !currentRow.classList.contains('blank-row')) {
        const cells = currentRow.querySelectorAll('td');
        if (cells.length > 0) {
            const item = cells[0].textContent.trim();
            const rarityText = cells[1].textContent.trim();

            // Determine rarity based on drop chance percentage
            let rarity = '';
            if (rarityText.includes('25.33%')) {
                rarity = 'Common';
            } else if (rarityText.includes('11.00%')) {
                rarity = 'Uncommon';
            } else if (rarityText.includes('2.00%')) {
                rarity = 'Rare';
            }

            rows.push({ item, rarity });
        }
        currentRow = currentRow.nextElementSibling;
    }

    return rows;
}

/**
 * Extracts data from multiple subtables and their associated relics
 * @param {string} url - The URL to fetch data from
 * @param {string[]} subTableTitles - Array of subtable titles to extract
 * @returns {Object} - Object containing relic data
 */
async function extractSubTableData(url, subTableTitles) {
    const document = await fetchAndParseHTML(url);
    if (!document) return {};

    const results = {};
    for (const title of subTableTitles) {
        results[title] = findSubTableData(document, title);
    }

    const relicData = {};
    for (const subTable in results) {
        for (const relic of results[subTable]) {
            relicData[relic] = findRelicTableData(document, relic);
        }
    }

    return relicData;
}

/**
 * Cleans and sorts the relics in proper order
 * @param {Object} relicsData - Raw relic data
 * @returns {string[]} - Sorted array of unique relic names
 */
function cleanAndOrderRelics(relicsData) {
    const relicsSet = new Set();

    for (const key in relicsData) {
        relicsData[key].forEach(item => relicsSet.add(item.item));
    }

    return Array.from(relicsSet).sort((a, b) => {
        const order = ['Lith', 'Meso', 'Neo', 'Axi'];
        const [typeA, typeB] = [a.split(' ')[0], b.split(' ')[0]];

        if (typeA === typeB) {
            return a.localeCompare(b);
        }
        return order.indexOf(typeA) - order.indexOf(typeB);
    });
}

/**
 * Groups relic rewards by prime item
 * @param {Object} relicData - Relic reward data
 * @returns {Object} - Grouped prime item data
 */
function extractPrimes(relicData) {
    const primes = {};

    for (const relic in relicData) {
        relicData[relic].forEach(({ item, rarity }) => {
            if (!item.includes('Forma') && item.includes('Prime')) {
                const primeName = item.split(' Prime')[0] + ' Prime';
                if (!primes[primeName]) {
                    primes[primeName] = [];
                }
                primes[primeName].push({ item, rarity, source: relic });
            }
        });
    }

    return primes;
}

/**
 * Generates markdown content from the extracted data
 * @param {Object} primes - Grouped prime item data
 * @param {Object} relicData - Relic reward data
 * @param {Object} relicLocations - Mapping of relic tiers to locations
 * @returns {string} - Generated markdown content
 */
function generateMarkdown(primes, relicData, relicLocations) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    let markdown = `# Generated on ${currentDate}\n\n# Primes\n\n`;

    // Sort primes alphabetically
    const sortedPrimes = Object.keys(primes).sort();

    sortedPrimes.forEach(prime => {
        markdown += `- ${prime}\n`;
        const sortedItems = primes[prime].sort((a, b) => {
            const rarityOrder = ['Rare', 'Uncommon', 'Common'];
            return rarityOrder.indexOf(a.rarity) - rarityOrder.indexOf(b.rarity);
        });
        sortedItems.forEach(({ item, rarity, source }) => {
            markdown += `  - ${item} (${rarity}) -> ${source}\n`;
        });
    });

    markdown += '\n# Relics\n\n';

    for (const relic in relicData) {
        markdown += `## ${relic}\n\n`;
        relicData[relic].forEach(({ item, rarity }) => {
            markdown += `- ${item} (${rarity})\n`;
        });
        markdown += `\n**Location**: ${relicLocations[relic.split(' ')[0]]}\n\n`;
    }

    return markdown;
}

/**
 * Main entry point
 */
async function main() {
    const url = 'https://warframe-web-assets.nyc3.cdn.digitaloceanspaces.com/uploads/cms/hnfvc0o3jnfvc873njb03enrf56.html';
    const subTableTitles = ['Void/Hepit (Capture)', 'Void/Ukko (Capture)', 'Lua/Apollo (Disruption)'];
    const relicLocations = {
        'Lith': 'Void/Hepit (Capture)',
        'Meso': 'Void/Ukko (Capture)',
        'Neo': 'Void/Ukko (Capture), Lua/Apollo (Disruption)',
        'Axi': 'Lua/Apollo (Disruption)'
    };

    try {
        console.log('Fetching Warframe relic data...');
        const data = await extractSubTableData(url, subTableTitles);
        
        if (Object.keys(data).length === 0) {
            throw new Error('No relic data found');
        }
        
        const cleanRelics = cleanAndOrderRelics(data);
        const primes = extractPrimes(data);
        const markdownContent = generateMarkdown(primes, data, relicLocations);
        
        fs.writeFileSync('currentPrimes.md', markdownContent);
        console.log('Markdown file has been generated as currentPrimes.md');
    } catch (error) {
        console.error('Error generating markdown:', error);
        process.exit(1);
    }
}

// Execute the main function
main();