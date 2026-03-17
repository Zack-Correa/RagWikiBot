/**
 * Summary Generator
 * Transforms parsed changelog data into contextual markdown summaries
 * following the format used in news posts (PT-BR)
 * Supports optional LLM-powered natural language generation
 */

const logger = require('../../utils/logger');
const llmService = require('../../services/llmService');

const DP_SERVER = 'LATAM';
const DP_ITEM_URL = `https://www.divine-pride.net/database/item`;
const DP_SKILL_URL = `https://www.divine-pride.net/database/skill`;

function dpItemLink(id) {
    return `${DP_ITEM_URL}/${id}/${DP_SERVER}`;
}

function dpSkillLink(id) {
    return `${DP_SKILL_URL}/${id}/${DP_SERVER}`;
}

/**
 * Item type classification based on ID ranges and name patterns
 */
const ITEM_CLASSIFIERS = [
    { test: (item) => isCard(item), label: 'Cartas' },
    { test: (item) => isCostume(item), label: 'Visuais / Costumes' },
    { test: (item) => isShadowEquip(item), label: 'Shadow Equipment' },
    { test: (item) => isPet(item), label: 'Mascotes' },
    { test: (item) => isWeapon(item), label: 'Armas' },
    { test: (item) => isHeadgear(item), label: 'Equipamentos de Cabeça' },
    { test: (item) => isArmor(item), label: 'Armaduras / Equipamentos' },
    { test: (item) => isAccessory(item), label: 'Acessórios' },
    { test: (item) => isConsumable(item), label: 'Consumíveis' },
    { test: (item) => isBox(item), label: 'Caixas e Pacotes' },
];

function isCard(item) {
    const n = (item.name || '').toLowerCase();
    const id = parseInt(item.id);
    return n.includes('card') || n.includes('carta') ||
           (item.typeInfo?.Itemclass || '').toLowerCase().includes('card') ||
           (id >= 4000 && id < 5000) || (id >= 300000 && id < 400000);
}

function isCostume(item) {
    const n = item.name || '';
    return n.startsWith('C_') || n.includes('[Visual]') || n.includes('[Disfraz]') ||
           n.includes('Costume') || n.includes('[visual]') ||
           (item.typeInfo?.Itemclass || '').toLowerCase().includes('costume');
}

function isShadowEquip(item) {
    const n = item.name || '';
    const id = parseInt(item.id);
    return (id >= 24000 && id < 25000) || n.includes('Shadow') || n.includes('Sombri');
}

function isPet(item) {
    const n = (item.name || '').toLowerCase();
    const id = parseInt(item.id);
    return (id >= 9000 && id < 10000) || n.includes('egg') || n.includes('ovo de') ||
           n.includes('pet basket') || n.includes('cesta de mascote') ||
           n.includes('mascote') || n.includes('ticket de mascote');
}

function isWeapon(item) {
    const cls = (item.typeInfo?.Itemclass || item.typeInfo?.['Weapon Level'] || '').toLowerCase();
    const n = (item.name || '').toLowerCase();
    if (item.typeInfo?.['Weapon Level']) return true;
    if (cls.includes('sword') || cls.includes('dagger') || cls.includes('bow') ||
        cls.includes('staff') || cls.includes('spear') || cls.includes('mace') ||
        cls.includes('axe') || cls.includes('katar') || cls.includes('knuckle') ||
        cls.includes('claw') || cls.includes('whip') || cls.includes('violin') ||
        cls.includes('book') || cls.includes('gun') || cls.includes('huuma')) return true;
    return n.includes('balista') || n.includes('arco ') || n.includes('espada') ||
           n.includes('adaga') || n.includes('cajado') || n.includes('lança') ||
           n.includes('maça') || n.includes('machado') || n.includes('katar') ||
           n.includes('soqueira') || n.includes('chicote') || n.includes('violino') ||
           n.includes('livro') || n.includes('revólver') || n.includes('rifle') ||
           n.includes('bastão') || n.includes('cinzas') || n.includes('foice') ||
           n.includes('martelo') || n.includes('arco-íris');
}

function isHeadgear(item) {
    const cls = (item.typeInfo?.Itemclass || '').toLowerCase();
    const id = parseInt(item.id);
    return cls.includes('headgear') || cls.includes('helm') ||
           (id >= 5000 && id < 6000) ||
           (id >= 18000 && id < 19500 && !isWeapon(item)) ||
           (id >= 19000 && id < 20700) ||
           (id >= 31000 && id < 32000) ||
           (id >= 400000 && id < 420000);
}

function isArmor(item) {
    const cls = (item.typeInfo?.Itemclass || '').toLowerCase();
    const n = (item.name || '').toLowerCase();
    const id = parseInt(item.id);
    return cls.includes('armor') || cls.includes('shield') || cls.includes('garment') ||
           cls.includes('shoes') || cls.includes('robe') ||
           n.includes('armadura') || n.includes('túnica') || n.includes('bata') ||
           n.includes('cota') || n.includes('manto') || n.includes('casaco') ||
           n.includes('xale') || n.includes('bota') || n.includes('sapato') ||
           n.includes('sapatilha') || n.includes('coturno') || n.includes('escudo') ||
           (id >= 420000 && id < 450000) ||
           (id >= 450000 && id < 470000) ||
           (id >= 470000 && id < 490000);
}

function isAccessory(item) {
    const cls = (item.typeInfo?.Itemclass || '').toLowerCase();
    const n = (item.name || '').toLowerCase();
    const id = parseInt(item.id);
    return cls.includes('accessory') ||
           n.includes('anel') || n.includes('brinco') || n.includes('colar') || n.includes('broche') ||
           (id >= 490000 && id < 500000) || (id >= 2600 && id < 2900);
}

function isConsumable(item) {
    const cls = (item.typeInfo?.Itemclass || '').toLowerCase();
    return cls.includes('consumable') || cls.includes('healing') || cls.includes('usable');
}

function isBox(item) {
    const n = (item.name || '').toLowerCase();
    return n.includes('box') || n.includes('caixa') || n.includes('package') ||
           n.includes('pacote') || n.includes('cube') || n.includes('cubo') ||
           n.includes('bundle') || n.includes('sacola');
}

/**
 * Classifies items into groups based on their properties
 * @param {Array} items - Deduplicated items
 * @returns {Object} Grouped items { label: [items] }
 */
function classifyItems(items) {
    const groups = {};
    const unclassified = [];

    for (const item of items) {
        let classified = false;
        for (const classifier of ITEM_CLASSIFIERS) {
            if (classifier.test(item)) {
                if (!groups[classifier.label]) groups[classifier.label] = [];
                groups[classifier.label].push(item);
                classified = true;
                break;
            }
        }
        if (!classified) {
            unclassified.push(item);
        }
    }

    if (unclassified.length > 0) {
        groups['Outros Itens'] = unclassified;
    }

    return groups;
}

/**
 * Generates a markdown table for items
 * @param {Array} items - Items to include
 * @param {Object} options - Table options
 * @returns {string} Markdown table
 */
function generateItemTable(items, options = {}) {
    const { includeDescription = false, includeType = false } = options;

    let headers = '| ID | Nome | Link |';
    let separator = '|----|------|------|';

    if (includeDescription) {
        headers = '| ID | Nome | Descrição | Link |';
        separator = '|----|------|-----------|------|';
    }
    if (includeType) {
        headers = '| ID | Nome | Tipo | Link |';
        separator = '|----|------|------|------|';
    }

    const rows = items.map(item => {
        const id = `[${item.id}](${dpItemLink(item.id)})`;
        const name = item.name || 'Item Desconhecido';
        const link = `[Ver](${dpItemLink(item.id)})`;

        if (includeDescription) {
            const desc = (item.description || '').split('\n')[0].substring(0, 80);
            return `| ${id} | ${name} | ${desc} | ${link} |`;
        }
        if (includeType) {
            const type = item.typeInfo?.Itemclass || item.typeInfo?.Type || '';
            return `| ${id} | ${name} | ${type} | ${link} |`;
        }
        return `| ${id} | ${name} | ${link} |`;
    });

    return [headers, separator, ...rows].join('\n');
}

/**
 * Generates the full contextual summary markdown
 * @param {Object} changelog - Parsed changelog object
 * @param {Object} topicMeta - Topic metadata (title, url, date)
 * @returns {string} Full markdown summary
 */
function generateSummary(changelog, topicMeta) {
    const lines = [];
    const dateStr = topicMeta.date || new Date().toLocaleDateString('pt-BR');

    lines.push(`# Changelog LATAM - ${dateStr}`);
    lines.push('');
    lines.push(`Fonte: [Divine Pride Forum](${topicMeta.url})`);
    lines.push('');
    lines.push('---');
    lines.push('');

    // Process Added Items
    if (changelog.added?.Item?.length > 0) {
        const items = changelog.added.Item;
        const grouped = classifyItems(items);

        for (const [label, groupItems] of Object.entries(grouped)) {
            if (groupItems.length === 0) continue;

            lines.push(`## ${label} (Novos)`);
            lines.push('');
            lines.push(generateItemTable(groupItems, {
                includeDescription: label === 'Cartas',
                includeType: label === 'Armas'
            }));
            lines.push('');
            lines.push('---');
            lines.push('');
        }
    }

    // Process Added CombiItems
    if (changelog.added?.Combiitem?.length > 0) {
        lines.push('## Novos Combos de Equipamento');
        lines.push('');
        lines.push('| Item 1 | Item 2 | Descrição |');
        lines.push('|--------|--------|-----------|');
        for (const combo of changelog.added.Combiitem) {
            const srcLabel = combo.sourceName || combo.sourceId;
            const tgtLabel = combo.targetName || combo.targetId;
            const src = `[${srcLabel}](${dpItemLink(combo.sourceId)})`;
            const tgt = `[${tgtLabel}](${dpItemLink(combo.targetId)})`;
            lines.push(`| ${src} | ${tgt} | ${combo.description} |`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    // Process Added LapineUpgradeBox (Cubo de Refino)
    if (changelog.added?.LapineUpgradeBox?.length > 0) {
        lines.push('## Novos Cubos de Refino');
        lines.push('');
        for (const lapine of changelog.added.LapineUpgradeBox) {
            lines.push(`### ${lapine.name || 'Cubo'}`);
            if (lapine.needSource) {
                lines.push(`> Fonte: ${lapine.needSource}`);
            }
            lines.push('');
            if (lapine.targetItems.length > 0) {
                lines.push('| ID | Nome | Link |');
                lines.push('|----|------|------|');
                for (const target of lapine.targetItems) {
                    lines.push(`| [${target.id}](${dpItemLink(target.id)}) | ${target.name} | [Ver](${dpItemLink(target.id)}) |`);
                }
            }
            lines.push('');
        }
        lines.push('---');
        lines.push('');
    }

    // Process Added LapineDdukddakBox (Combinadores)
    if (changelog.added?.LapineDdukddakBox?.length > 0) {
        lines.push('## Novos Combinadores');
        lines.push('');
        for (const lapine of changelog.added.LapineDdukddakBox) {
            lines.push(`### ${lapine.name || 'Combinador'}`);
            if (lapine.needSource) {
                lines.push(`> Fonte: ${lapine.needSource}`);
            }
            lines.push('');
            if (lapine.targetItems.length > 0) {
                lines.push('| ID | Nome | Link |');
                lines.push('|----|------|------|');
                for (const target of lapine.targetItems) {
                    lines.push(`| [${target.id}](${dpItemLink(target.id)}) | ${target.name} | [Ver](${dpItemLink(target.id)}) |`);
                }
            }
            lines.push('');
        }
        lines.push('---');
        lines.push('');
    }

    // Process Added Skills
    if (changelog.added?.Skill?.length > 0) {
        lines.push('## Novas Skills');
        lines.push('');
        lines.push('| ID | Nome | Link |');
        lines.push('|----|------|------|');
        for (const skill of changelog.added.Skill) {
            lines.push(`| ${skill.id} | ${skill.name} | [Ver](${dpSkillLink(skill.id)}) |`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    // Process Added Maps
    if (changelog.added?.Map?.length > 0) {
        lines.push('## Novos Mapas');
        lines.push('');
        lines.push('| ID | Nome | Link |');
        lines.push('|----|------|------|');
        for (const map of changelog.added.Map) {
            lines.push(`| ${map.id} | ${map.name} | [Ver](${map.url}) |`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    // Process Changed Items
    if (changelog.changed?.Item?.length > 0) {
        const items = changelog.changed.Item;
        const grouped = classifyItems(items);

        for (const [label, groupItems] of Object.entries(grouped)) {
            if (groupItems.length === 0) continue;

            lines.push(`## ${label} (Alterados)`);
            lines.push('');
            lines.push(generateItemTable(groupItems));
            lines.push('');
            lines.push('---');
            lines.push('');
        }
    }

    // Process Changed Skills
    if (changelog.changed?.Skill?.length > 0) {
        lines.push('## Skills Alteradas');
        lines.push('');
        lines.push('| ID | Nome | Link |');
        lines.push('|----|------|------|');
        for (const skill of changelog.changed.Skill) {
            const name = skill.name || `Skill ${skill.id}`;
            lines.push(`| ${skill.id} | ${name} | [Ver](${dpSkillLink(skill.id)}) |`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    // Process Changed Maps
    if (changelog.changed?.Map?.length > 0) {
        lines.push('## Mapas Alterados');
        lines.push('');
        lines.push('| ID | Nome | Link |');
        lines.push('|----|------|------|');
        for (const map of changelog.changed.Map) {
            lines.push(`| ${map.id} | ${map.name} | [Ver](${map.url}) |`);
        }
        lines.push('');
        lines.push('---');
        lines.push('');
    }

    // Process Changed LapineUpgradeBox
    if (changelog.changed?.LapineUpgradeBox?.length > 0) {
        lines.push('## Cubos de Refino (Alterados)');
        lines.push('');
        for (const lapine of changelog.changed.LapineUpgradeBox) {
            lines.push(`### ${lapine.name || 'Cubo'}`);
            if (lapine.needSource) {
                lines.push(`> Fonte: ${lapine.needSource}`);
            }
            if (lapine.targetItems.length > 0) {
                lines.push('');
                lines.push('| ID | Nome | Link |');
                lines.push('|----|------|------|');
                for (const target of lapine.targetItems) {
                    lines.push(`| [${target.id}](${dpItemLink(target.id)}) | ${target.name} | [Ver](${dpItemLink(target.id)}) |`);
                }
            }
            lines.push('');
        }
        lines.push('---');
        lines.push('');
    }

    // Add stats footer
    const stats = getChangelogStats(changelog);
    lines.push('## Resumo');
    lines.push('');
    lines.push(`- **Itens adicionados:** ${stats.addedItems}`);
    lines.push(`- **Itens alterados:** ${stats.changedItems}`);
    lines.push(`- **Skills adicionadas:** ${stats.addedSkills}`);
    lines.push(`- **Skills alteradas:** ${stats.changedSkills}`);
    lines.push(`- **Mapas:** ${stats.addedMaps + stats.changedMaps}`);
    lines.push(`- **Combos:** ${stats.addedCombis}`);
    lines.push('');

    return lines.join('\n');
}

/**
 * Gets changelog statistics
 * @param {Object} changelog - Parsed changelog
 * @returns {Object} Stats
 */
function getChangelogStats(changelog) {
    return {
        addedItems: changelog.added?.Item?.length || 0,
        changedItems: changelog.changed?.Item?.length || 0,
        addedSkills: changelog.added?.Skill?.length || 0,
        changedSkills: changelog.changed?.Skill?.length || 0,
        addedMaps: changelog.added?.Map?.length || 0,
        changedMaps: changelog.changed?.Map?.length || 0,
        addedCombis: changelog.added?.Combiitem?.length || 0,
        addedNpcs: changelog.added?.NpcIdentity?.length || 0,
        addedLapineUpgrade: changelog.added?.LapineUpgradeBox?.length || 0,
        addedLapineDdukddak: changelog.added?.LapineDdukddakBox?.length || 0
    };
}

/**
 * Generates a short Discord embed summary (for channel post)
 * @param {Object} changelog - Parsed changelog
 * @param {Object} topicMeta - Topic metadata
 * @returns {Object} Summary data for embed { title, description, fields, url }
 */
function generateEmbedSummary(changelog, topicMeta) {
    const stats = getChangelogStats(changelog);
    const dateStr = topicMeta.date || new Date().toLocaleDateString('pt-BR');

    const description = [
        `Nova atualização do LATAM detectada! (${dateStr})`,
        '',
        `**${stats.addedItems}** itens adicionados`,
        `**${stats.changedItems}** itens alterados`,
        stats.addedSkills > 0 ? `**${stats.addedSkills}** skills adicionadas` : null,
        stats.changedSkills > 0 ? `**${stats.changedSkills}** skills alteradas` : null,
        stats.addedMaps > 0 ? `**${stats.addedMaps}** mapas adicionados` : null,
        stats.addedCombis > 0 ? `**${stats.addedCombis}** novos combos` : null,
    ].filter(Boolean).join('\n');

    // Build highlights from added items
    const highlights = [];
    const addedItems = changelog.added?.Item || [];
    const cards = addedItems.filter(i => isCard(i));
    const weapons = addedItems.filter(i => isWeapon(i));
    const shadowItems = addedItems.filter(i => isShadowEquip(i));
    const costumes = addedItems.filter(i => isCostume(i));

    if (cards.length > 0) {
        const sample = cards.slice(0, 3).map(c => c.name).join(', ');
        highlights.push({ name: '🃏 Novas Cartas', value: `${cards.length} cartas (${sample}...)`, inline: true });
    }
    if (weapons.length > 0) {
        const sample = weapons.slice(0, 3).map(w => w.name).join(', ');
        highlights.push({ name: '⚔️ Novas Armas', value: `${weapons.length} armas (${sample}...)`, inline: true });
    }
    if (shadowItems.length > 0) {
        highlights.push({ name: '🌑 Shadow Equipment', value: `${shadowItems.length} novos itens shadow`, inline: true });
    }
    if (costumes.length > 0) {
        highlights.push({ name: '👗 Visuais', value: `${costumes.length} novos visuais`, inline: true });
    }

    return {
        title: `📋 Changelog LATAM - ${dateStr}`,
        description,
        fields: highlights,
        url: topicMeta.url
    };
}

// ===================== LLM Analysis + Discord Embed Builder =====================

const CATEGORY_EMOJIS = {
    'Cartas': '🃏',
    'Armas': '⚔️',
    'Shadow Equipment': '🌑',
    'Visuais / Costumes': '👗',
    'Mascotes': '🐾',
    'Equipamentos de Cabeça': '🛡️',
    'Armaduras / Equipamentos': '🛡️',
    'Acessórios': '💍',
    'Consumíveis': '🧪',
    'Caixas e Pacotes': '📦',
    'Outros Itens': '📋'
};

const SYSTEM_PROMPT = `Você analisa changelogs de Ragnarok Online LATAM para jogadores brasileiros.

Responda EXATAMENTE neste formato. Cada seção é separada por uma linha contendo apenas "---":

OVERVIEW
4-6 frases resumindo a atualização. Inclua:
- Números reais (quantos itens, skills, etc.)
- Quais categorias vieram (cartas, armas, shadow, costumes, etc.)
- Se há algo que se destaca nos dados (muitos itens de uma categoria, skills alteradas, novos cubos de refino)
- Para quem essa atualização parece relevante (classes, tipos de build, etc.) — APENAS se tiver evidência nos dados (ex: nome de skill indica classe, tipo de equipamento indica papel)
Tom conversacional e direto, como um amigo que joga explicando pro grupo.

---

HIGHLIGHTS
- 5-8 bullets detalhados sobre o que mais importa na atualização
- Para cada bullet, explique BREVEMENTE por que é relevante (ex: "nova carta de redução de cast — útil pra builds mágicas")
- Inclua o nome EXATO e ID dos itens/skills referenciados: **Nome Exato** (ID)
- Se uma carta ou equip tem descrição nos dados, resuma o efeito em 1 frase
- Se não tem descrição, diga que é novo sem inventar efeito

---

CONTEXTO
Notas breves por categoria que teve itens. Uma linha por categoria, formato:
- **Categoria**: o que veio e pra quem interessa (1 frase)
Apenas categorias que apareceram nos dados. Ex:
- **Cartas**: 3 cartas novas, destaque pra carta X com efeito de Y
- **Shadow Equipment**: 5 peças pra linha Doram, complementam build Z

Regras obrigatórias:
- Os dados fornecidos são do servidor LATAM em PORTUGUÊS (PT-BR)
- Use SEMPRE os nomes em PORTUGUÊS dos itens/skills conforme aparecem nos dados
- Cite itens usando nome EXATO dos dados + ID: **Nome Exato** (ID)
- Baseie-se APENAS nas descrições fornecidas nos dados
- Sem descrição = não especule, diga apenas que é novo
- Sem hype: nada de "incrível", "imperdível", "fique ligado", "não perca"
- NUNCA invente ou altere nomes de itens
- NUNCA invente descrições, efeitos ou stats
- NUNCA use nomes em inglês se houver nome em português nos dados
- Seja informativo e objetivo — mais detalhe é melhor, mas sem enrolação`;

/**
 * Compresses changelog data for LLM analysis input.
 * Provides enough context for the LLM to determine relevance.
 */
function compressForPrompt(changelog, topicMeta) {
    const parts = [];
    const dateStr = topicMeta.date || new Date().toLocaleDateString('pt-BR');
    const stats = getChangelogStats(changelog);

    parts.push(`Changelog LATAM (Servidor: LATAM, Idioma: PT-BR) - ${dateStr}`);
    parts.push(`IMPORTANTE: Todos os nomes e descrições abaixo estão em PORTUGUÊS (PT-BR) do servidor LATAM. Use esses nomes exatos.`);
    parts.push(`Total: ${stats.addedItems} itens novos, ${stats.changedItems} alterados, ${stats.addedSkills} skills novas, ${stats.changedSkills} skills alteradas, ${stats.addedMaps} mapas novos, ${stats.addedCombis} combos`);
    parts.push('');

    const addedItems = changelog.added?.Item || [];
    if (addedItems.length > 0) {
        const grouped = classifyItems(addedItems);
        parts.push('=== ITENS ADICIONADOS ===');
        for (const [label, items] of Object.entries(grouped)) {
            parts.push(`[${label}] (${items.length}):`);
            for (const item of items) {
                const desc = (item.description || '').split('\n').filter(l => l.trim()).slice(0, 2).join(' ').substring(0, 150);
                parts.push(desc ? `  ${item.name} (${item.id}) — ${desc}` : `  ${item.name} (${item.id})`);
            }
        }
        parts.push('');
    }

    const addedSkills = changelog.added?.Skill || [];
    if (addedSkills.length > 0) {
        parts.push(`=== SKILLS ADICIONADAS (${addedSkills.length}) ===`);
        for (const s of addedSkills) parts.push(`  ${s.name || 'Skill'} (${s.id})`);
        parts.push('');
    }

    const combis = changelog.added?.Combiitem || [];
    if (combis.length > 0) {
        parts.push(`=== NOVOS COMBOS (${combis.length}) ===`);
        for (const c of combis) {
            const srcName = c.sourceName || c.sourceId;
            const tgtName = c.targetName || c.targetId;
            parts.push(`  ${srcName} (${c.sourceId}) + ${tgtName} (${c.targetId})`);
        }
        parts.push('');
    }

    for (const [key, label] of [['LapineUpgradeBox', 'CUBOS DE REFINO'], ['LapineDdukddakBox', 'COMBINADORES']]) {
        const items = changelog.added?.[key] || [];
        if (items.length > 0) {
            parts.push(`=== ${label} ===`);
            for (const l of items) {
                const targets = l.targetItems.map(t => `${t.name} (${t.id})`).join(', ');
                parts.push(`  ${l.name} — Fonte: ${l.needSource} — Alvos: ${targets}`);
            }
            parts.push('');
        }
    }

    const changedItems = changelog.changed?.Item || [];
    if (changedItems.length > 0) {
        const grouped = classifyItems(changedItems);
        parts.push(`=== ITENS ALTERADOS (${changedItems.length}) ===`);
        for (const [label, items] of Object.entries(grouped)) {
            parts.push(`[${label}] (${items.length}): ${items.slice(0, 5).map(i => i.name).join(', ')}${items.length > 5 ? '...' : ''}`);
        }
        parts.push('');
    }

    const changedSkills = changelog.changed?.Skill || [];
    if (changedSkills.length > 0) {
        parts.push(`=== SKILLS ALTERADAS (${changedSkills.length}) ===`);
        for (const s of changedSkills) parts.push(`  ${s.name || 'Skill'} (${s.id})`);
        parts.push('');
    }

    const addedMaps = changelog.added?.Map || [];
    const changedMaps = changelog.changed?.Map || [];
    if (addedMaps.length + changedMaps.length > 0) {
        parts.push('=== MAPAS ===');
        if (addedMaps.length) for (const m of addedMaps) parts.push(`  Novo: ${m.name || m.id}`);
        if (changedMaps.length) for (const m of changedMaps) parts.push(`  Alterado: ${m.name || m.id}`);
        parts.push('');
    }

    return parts.join('\n');
}

/**
 * Calls the LLM to generate only the overview + highlights analysis.
 * Returns {overview, highlights} or null.
 */
async function generateLLMAnalysis(changelog, topicMeta) {
    if (!llmService.isAvailable()) return null;

    try {
        const compactData = compressForPrompt(changelog, topicMeta);
        const dateStr = topicMeta.date || new Date().toLocaleDateString('pt-BR');

        logger.info('Generating LLM analysis', {
            inputChars: compactData.length,
            provider: llmService.getConfig().provider
        });

        const userPrompt = `Analise este changelog do Ragnarok Online LATAM (${dateStr}).
A listagem completa dos itens será feita automaticamente pelo sistema.
Você precisa gerar OVERVIEW, HIGHLIGHTS e CONTEXTO.
Seja detalhado nos highlights — quanto mais informação útil, melhor.

${compactData}`;

        const result = await llmService.generate(SYSTEM_PROMPT, userPrompt, {
            maxTokens: 2048,
            temperature: 0.4
        });

        if (!result || result.length < 30) {
            logger.warn('LLM generated insufficient output', { length: result?.length });
            return null;
        }

        return parseLLMResponse(result);
    } catch (error) {
        logger.error('Error generating LLM analysis', { error: error.message });
        return null;
    }
}

function parseLLMResponse(text) {
    // Split by --- separator lines
    const sections = text.split(/\n---\s*\n/);
    let overview = '', highlights = '', context = '';

    if (sections.length >= 3) {
        overview = sections[0].replace(/^OVERVIEW\s*/i, '').trim();
        highlights = sections[1].replace(/^HIGHLIGHTS\s*/i, '').trim();
        context = sections.slice(2).join('\n').replace(/^CONTEXTO?\s*/i, '').trim();
    } else if (sections.length === 2) {
        overview = sections[0].replace(/^OVERVIEW\s*/i, '').trim();
        // Try to split highlights from context
        const ctxMatch = sections[1].match(/\nCONTEXTO?\s*\n/i);
        if (ctxMatch) {
            const idx = sections[1].indexOf(ctxMatch[0]);
            highlights = sections[1].substring(0, idx).replace(/^HIGHLIGHTS\s*/i, '').trim();
            context = sections[1].substring(idx + ctxMatch[0].length).trim();
        } else {
            highlights = sections[1].replace(/^HIGHLIGHTS\s*/i, '').trim();
        }
    } else {
        // No separators — try header-based parsing
        const hlMatch = text.match(/HIGHLIGHTS\s*\n/i);
        const ctxMatch = text.match(/CONTEXTO?\s*\n/i);

        if (hlMatch) {
            const hlIdx = text.indexOf(hlMatch[0]);
            overview = text.substring(0, hlIdx).replace(/^OVERVIEW\s*/i, '').trim();

            if (ctxMatch) {
                const ctxIdx = text.indexOf(ctxMatch[0]);
                highlights = text.substring(hlIdx + hlMatch[0].length, ctxIdx).trim();
                context = text.substring(ctxIdx + ctxMatch[0].length).trim();
            } else {
                highlights = text.substring(hlIdx + hlMatch[0].length).trim();
            }
        } else {
            overview = text.replace(/^OVERVIEW\s*/i, '').trim();
        }
    }

    return { overview, highlights, context };
}

// ===================== Discord Embed Builder =====================

function formatItemLine(item, type = 'item') {
    const linkFn = type === 'skill' ? dpSkillLink : dpItemLink;
    const name = item.name || `${type === 'skill' ? 'Skill' : 'Item'} ${item.id}`;
    const link = `[${name}](${linkFn(item.id)})`;
    const desc = (item.description || '').split('\n').filter(l => l.trim()).slice(0, 1).join('').substring(0, 100).trim();
    return desc ? `- ${link} (${item.id}) — ${desc}` : `- ${link} (${item.id})`;
}

function splitFieldValue(lines, maxLen = 1024) {
    if (lines.length === 0) return [];
    const chunks = [];
    let current = '';
    for (const line of lines) {
        if (current.length + line.length + 1 > maxLen) {
            if (current) chunks.push(current);
            current = line.length > maxLen ? line.substring(0, maxLen) : line;
        } else {
            current += (current ? '\n' : '') + line;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

/**
 * Splits a block of text (paragraphs, bullets) into chunks respecting a max length.
 * Tries to split at paragraph boundaries (\n\n), then line boundaries (\n).
 */
function splitTextToChunks(text, maxLen) {
    if (!text || text.length <= maxLen) return [text || ''];

    const chunks = [];
    let remaining = text;

    while (remaining.length > maxLen) {
        let splitAt = remaining.lastIndexOf('\n\n', maxLen);
        if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf('\n', maxLen);
        if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf('. ', maxLen);
        if (splitAt < maxLen * 0.3) splitAt = maxLen;

        chunks.push(remaining.substring(0, splitAt).trimEnd());
        remaining = remaining.substring(splitAt).trimStart();
    }
    if (remaining.trim()) chunks.push(remaining.trim());
    return chunks;
}

/**
 * Builds paginated embed pages from parsed changelog + optional LLM analysis.
 * Page 1 = overview + highlights. Remaining pages = categories with items.
 * Each page is a single embed under 6000 chars, navigable via buttons.
 * @param {Object} changelog - Parsed changelog
 * @param {Object} topicMeta - Topic metadata
 * @param {Object|null} analysis - LLM {overview, highlights} or null
 * @returns {Array<Object>} Array of embed data objects (one per page)
 */
function buildChangelogEmbeds(changelog, topicMeta, analysis) {
    const dateStr = topicMeta.date || new Date().toLocaleDateString('pt-BR');
    const stats = getChangelogStats(changelog);
    const hasLlm = !!(analysis && analysis.overview);
    const baseTitle = `📋 Atualização LATAM — ${dateStr}`;
    const baseColor = hasLlm ? '#9b59b6' : '#0099ff';

    // --- Collect all field data first ---
    const allFields = [];

    function addCategory(emoji, label, items, type = 'item') {
        if (!items || items.length === 0) return;
        const lines = items.map(i => formatItemLine(i, type));
        const chunks = splitFieldValue(lines);
        for (let i = 0; i < chunks.length; i++) {
            const name = chunks.length > 1 ? `${emoji} ${label} (${i + 1}/${chunks.length})` : `${emoji} ${label}`;
            allFields.push({ name, value: chunks[i] });
        }
    }

    function addGenericFields(emoji, label, entries, formatter) {
        if (!entries || entries.length === 0) return;
        const lines = entries.map(formatter);
        const chunks = splitFieldValue(lines);
        chunks.forEach((chunk, i) => {
            const name = chunks.length > 1 ? `${emoji} ${label} (${i + 1}/${chunks.length})` : `${emoji} ${label}`;
            allFields.push({ name, value: chunk });
        });
    }

    // Added items by category
    const addedItems = changelog.added?.Item || [];
    if (addedItems.length > 0) {
        const grouped = classifyItems(addedItems);
        for (const [label, items] of Object.entries(grouped)) {
            addCategory(CATEGORY_EMOJIS[label] || '📋', label, items);
        }
    }

    addCategory('⚡', 'Skills Novas', changelog.added?.Skill, 'skill');

    addGenericFields('🧩', 'Combos', changelog.added?.Combiitem, c => {
        const srcLabel = c.sourceName || c.sourceId;
        const tgtLabel = c.targetName || c.targetId;
        const src = `[${srcLabel}](${dpItemLink(c.sourceId)})`;
        const tgt = `[${tgtLabel}](${dpItemLink(c.targetId)})`;
        return `- ${src} + ${tgt}`;
    });

    for (const [key, emoji, label] of [['LapineUpgradeBox', '🔧', 'Cubos de Refino'], ['LapineDdukddakBox', '🔗', 'Combinadores']]) {
        addGenericFields(emoji, label, changelog.added?.[key], l => {
            const targets = l.targetItems.slice(0, 5).map(t => `[${t.name}](${dpItemLink(t.id)})`).join(', ');
            const more = l.targetItems.length > 5 ? ` +${l.targetItems.length - 5} mais` : '';
            return `- **${l.name}** — Fonte: ${l.needSource} — ${targets}${more}`;
        });
    }

    addGenericFields('🗺️', 'Mapas Novos', changelog.added?.Map, m => `- ${m.name || m.id}`);
    addGenericFields('👤', 'NPCs', changelog.added?.NpcIdentity, n => `- ${n.name || n.id} (${n.id})`);
    addGenericFields('📜', 'Quests', changelog.added?.Quest, q => `- ${q.name || q.id} (${q.id})`);

    // Changes section
    const changeLines = [];
    const changedSkills = changelog.changed?.Skill || [];
    const changedItems = changelog.changed?.Item || [];
    const changedMaps = changelog.changed?.Map || [];
    const changedLapine = changelog.changed?.LapineUpgradeBox || [];

    if (changedSkills.length > 0) {
        for (const s of changedSkills) changeLines.push(`- ⚡ [${s.name || `Skill ${s.id}`}](${dpSkillLink(s.id)}) (${s.id})`);
    }
    if (changedItems.length > 0) {
        const grouped = classifyItems(changedItems);
        for (const [label, items] of Object.entries(grouped)) changeLines.push(`- ${CATEGORY_EMOJIS[label] || '📋'} ${items.length}x ${label}`);
    }
    if (changedMaps.length > 0) changeLines.push(`- 🗺️ ${changedMaps.length}x Mapas`);
    if (changedLapine.length > 0) {
        for (const l of changedLapine) changeLines.push(`- 🔧 ${l.name || 'Cubo de Refino'}`);
    }
    if (changeLines.length > 0) {
        const chunks = splitFieldValue(changeLines);
        chunks.forEach((chunk, i) => {
            allFields.push({ name: chunks.length > 1 ? `🔄 Alterações (${i + 1}/${chunks.length})` : '🔄 Alterações', value: chunk });
        });
    }

    // --- Build pages from all content ---
    const PAGE_CHAR_LIMIT = 5500;
    const MAX_FIELDS_PER_PAGE = 8;
    const FIELD_VALUE_LIMIT = 1024;
    const DESC_LIMIT = 4096;
    const pages = [];

    const fallbackDesc = [
        `**${stats.addedItems}** itens novos, **${stats.changedItems}** alterados.`,
        stats.addedSkills > 0 ? `**${stats.addedSkills}** skills novas.` : null,
        stats.changedSkills > 0 ? `**${stats.changedSkills}** skills alteradas.` : null,
        stats.addedMaps > 0 ? `**${stats.addedMaps}** mapas novos.` : null,
        stats.addedCombis > 0 ? `**${stats.addedCombis}** combos novos.` : null,
    ].filter(Boolean).join(' ');

    const sourceFieldText = `[Ver no Divine Pride](${topicMeta.url})`;

    // Build LLM content as sections that can span multiple pages
    const llmFields = [];
    if (hasLlm && analysis.highlights) {
        const chunks = splitTextToChunks(analysis.highlights, FIELD_VALUE_LIMIT);
        chunks.forEach((chunk, i) => {
            const name = chunks.length > 1 ? `⭐ O que importa (${i + 1}/${chunks.length})` : '⭐ O que importa';
            llmFields.push({ name, value: chunk });
        });
    }
    if (hasLlm && analysis.context) {
        const chunks = splitTextToChunks(analysis.context, FIELD_VALUE_LIMIT);
        chunks.forEach((chunk, i) => {
            const name = chunks.length > 1 ? `📝 Contexto por categoria (${i + 1}/${chunks.length})` : '📝 Contexto por categoria';
            llmFields.push({ name, value: chunk });
        });
    }
    llmFields.push({ name: '🔗 Fonte', value: sourceFieldText });

    // Build description: overview text, possibly split if too long
    const overviewFull = hasLlm ? (analysis.overview || fallbackDesc) : fallbackDesc;
    const overviewChunks = splitTextToChunks(overviewFull, DESC_LIMIT);

    // First LLM page: description + as many fields as fit
    let llmFieldIdx = 0;
    for (let descIdx = 0; descIdx < overviewChunks.length; descIdx++) {
        const isFirst = descIdx === 0;
        const description = overviewChunks[descIdx];
        let usedChars = baseTitle.length + description.length + 100;
        const pageFields = [];

        // Only pack fields into the last overview chunk page
        if (descIdx === overviewChunks.length - 1) {
            while (llmFieldIdx < llmFields.length) {
                const f = llmFields[llmFieldIdx];
                const fSize = f.name.length + f.value.length;
                if (pageFields.length >= MAX_FIELDS_PER_PAGE || (usedChars + fSize > PAGE_CHAR_LIMIT && pageFields.length > 0)) break;
                pageFields.push({ ...f, inline: false });
                usedChars += fSize;
                llmFieldIdx++;
            }
        }

        pages.push({
            color: baseColor,
            title: isFirst ? baseTitle : `${baseTitle} (cont.)`,
            url: topicMeta.url,
            description,
            fields: pageFields,
            timestamp: isFirst
        });
    }

    // Remaining LLM fields that didn't fit
    while (llmFieldIdx < llmFields.length) {
        let usedChars = baseTitle.length + 100;
        const pageFields = [];
        while (llmFieldIdx < llmFields.length) {
            const f = llmFields[llmFieldIdx];
            const fSize = f.name.length + f.value.length;
            if (pageFields.length >= MAX_FIELDS_PER_PAGE || (usedChars + fSize > PAGE_CHAR_LIMIT && pageFields.length > 0)) break;
            pageFields.push({ ...f, inline: false });
            usedChars += fSize;
            llmFieldIdx++;
        }
        if (pageFields.length > 0) {
            pages.push({
                color: baseColor,
                title: `${baseTitle} (cont.)`,
                url: topicMeta.url,
                fields: pageFields
            });
        }
    }

    // Item/skill/combo pages: pack allFields into pages
    let currentFields = [];
    let currentSize = 0;

    function flushPage() {
        if (currentFields.length === 0) return;
        pages.push({
            color: '#2b2d31',
            title: baseTitle,
            url: topicMeta.url,
            fields: [...currentFields],
            timestamp: false
        });
        currentFields = [];
        currentSize = 0;
    }

    for (const field of allFields) {
        let fieldValue = field.value;
        const fieldSize = field.name.length + fieldValue.length;

        if (fieldSize > PAGE_CHAR_LIMIT) {
            fieldValue = fieldValue.substring(0, PAGE_CHAR_LIMIT - field.name.length - 10) + '\n...';
        }

        const newFieldSize = field.name.length + fieldValue.length;

        if (currentFields.length >= MAX_FIELDS_PER_PAGE || (currentFields.length > 0 && currentSize + newFieldSize > PAGE_CHAR_LIMIT)) {
            flushPage();
        }

        currentFields.push({ name: field.name, value: fieldValue, inline: false });
        currentSize += newFieldSize;
    }
    flushPage();

    // Add page numbers + footer to all pages
    const totalPages = pages.length;
    const footerBase = hasLlm ? `BeeWiki • IA (${llmService.getConfig().model})` : 'BeeWiki • Changelog Monitor';
    for (let i = 0; i < pages.length; i++) {
        pages[i].footer = `${footerBase} • Página ${i + 1}/${totalPages}`;
    }

    return pages;
}

module.exports = {
    generateSummary,
    generateEmbedSummary,
    getChangelogStats,
    classifyItems,
    generateLLMAnalysis,
    buildChangelogEmbeds,
    compressForPrompt
};
