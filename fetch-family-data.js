// Published Google Sheets CSV URL
const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/***REMOVED-SHEET-TOKEN***/pub?gid=0&single=true&output=csv';

// ── UI element references ──
const ui = {
  loading:   () => document.getElementById('loadingState'),
  error:     () => document.getElementById('errorState'),
  wrapper:   () => document.getElementById('treeWrapper'),
  retry:     () => document.getElementById('retryBtn'),
  search:    () => document.getElementById('searchInput'),
  searchBox: () => document.getElementById('searchContainer'),
  clearBtn:  () => document.getElementById('searchClear'),
  noResults: () => document.getElementById('noResults'),
  statMembers:     () => document.getElementById('statMembers'),
  statGenerations: () => document.getElementById('statGenerations'),
  breadcrumb:      () => document.getElementById('breadcrumbBar'),
};

// ── State ──
let treantInstance = null;
let allNodeNames = [];  // flat list of {name, element} for search

// ── Main loader ──
async function loadFamilyTree() {
  showLoading();
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    const csvText = await response.text();
    const rows = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data;

    const tree = buildHierarchy(rows);
    const stats = computeStats(tree);
    updateStats(stats);

    const familyConfig = {
      chart: {
        container: '#tree-simple',
        rootOrientation: 'NORTH',
        connectors: { type: 'step' },
        node: { collapsable: true }
      },
      nodeStructure: tree
    };

    collapseChildren(familyConfig.nodeStructure);
    showTree();

    treantInstance = new Treant(familyConfig, () => {
      applyGenerationClasses(tree, 0);
      bindNodeClicks();
      bindSearch();
      bindBreadcrumbs();
    });
  } catch (err) {
    console.error('Failed to load family data', err);
    showError();
  }
}

// ── UI state transitions ──
function showLoading() {
  ui.loading().style.display = 'flex';
  ui.error().style.display = 'none';
  ui.wrapper().style.display = 'none';
}

function showError() {
  ui.loading().style.display = 'none';
  ui.error().style.display = 'flex';
  ui.wrapper().style.display = 'none';
}

function showTree() {
  ui.loading().style.display = 'none';
  ui.error().style.display = 'none';
  ui.wrapper().style.display = '';
}

// ── Card creation ──
function createCard(row) {
  const name = row['Name'] ? row['Name'].trim() : '';
  const details = Object.keys(row)
    .filter(k => k !== 'Name' && k !== 'Parent' && row[k] && row[k].trim())
    .map(k => `<div class="card-detail"><strong>${k}:</strong> ${row[k].trim()}</div>`)
    .join('');
  return `
    <div class="family-card" data-name="${name.toLowerCase()}">
      <div class="card-name">${name}</div>
      ${details}
    </div>
  `;
}

// ── Hierarchy builder ──
function buildHierarchy(rows) {
  const nodes = {};
  rows.forEach(row => {
    const name = row['Name'].trim();
    nodes[name] = { innerHTML: createCard(row), _name: name };
  });

  let root = null;
  rows.forEach(row => {
    const name = row['Name'].trim();
    const parentKey = row['Parent'] ? row['Parent'].trim() : '';
    if (!parentKey) {
      root = nodes[name];
    } else {
      const parent = findParent(parentKey, nodes);
      if (parent) {
        parent.children = parent.children || [];
        parent.children.push(nodes[name]);
      }
    }
  });
  return root;
}

function findParent(key, nodes) {
  if (nodes[key]) return nodes[key];
  const match = Object.keys(nodes).find(k => k.includes(key));
  return match ? nodes[match] : null;
}

// ── Collapse children ──
function collapseChildren(node) {
  if (node.children && node.children.length) {
    node.children.forEach(child => {
      child.collapsed = true;
      collapseChildren(child);
    });
  }
}

// ── Apply generation CSS classes to rendered DOM nodes ──
function applyGenerationClasses(treeNode, depth) {
  const container = document.querySelector('#tree-simple');
  const name = treeNode._name;
  if (name) {
    const card = container.querySelector(`.family-card[data-name="${name.toLowerCase()}"]`);
    if (card) {
      const nodeEl = card.closest('.node');
      if (nodeEl) {
        nodeEl.classList.add('gen-' + Math.min(depth, 5));
        allNodeNames.push({ name: name.toLowerCase(), element: nodeEl });
      }
    }
  }
  if (treeNode.children) {
    treeNode.children.forEach(child => applyGenerationClasses(child, depth + 1));
  }
}

// ── Stats ──
function computeStats(tree) {
  let count = 0;
  let maxDepth = 0;
  function walk(node, depth) {
    count++;
    if (depth > maxDepth) maxDepth = depth;
    if (node.children) node.children.forEach(c => walk(c, depth + 1));
  }
  walk(tree, 0);
  return { members: count, generations: maxDepth + 1 };
}

function updateStats(stats) {
  ui.statMembers().querySelector('span').textContent = stats.members + ' Members';
  ui.statGenerations().querySelector('span').textContent = stats.generations + ' Generations';
}

// ── Click handling ──
function bindNodeClicks() {
  const container = document.querySelector('#tree-simple');
  container.addEventListener('click', e => {
    const nodeEl = e.target.closest('.node');
    if (nodeEl && !e.target.classList.contains('collapse-switch')) {
      const toggle = nodeEl.querySelector('.collapse-switch');
      if (toggle) toggle.click();
    }
  });
}

// ── Search ──
function bindSearch() {
  const input = ui.search();
  const box = ui.searchBox();
  const clearBtn = ui.clearBtn();
  const noResults = ui.noResults();
  let debounceTimer = null;

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    box.classList.toggle('has-value', query.length > 0);

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => performSearch(query), 150);
  });

  // Dismiss mobile keyboard on Enter/Search key
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    box.classList.remove('has-value');
    clearSearch();
    input.focus();
  });

  function performSearch(query) {
    if (!query) {
      clearSearch();
      return;
    }

    let matchCount = 0;
    allNodeNames.forEach(({ name, element }) => {
      if (name.includes(query)) {
        element.classList.add('search-match');
        element.classList.remove('search-dimmed');
        matchCount++;
      } else {
        element.classList.remove('search-match');
        element.classList.add('search-dimmed');
      }
    });

    noResults.classList.toggle('visible', matchCount === 0);
    if (matchCount > 0) {
      // Scroll first match into view
      const firstMatch = document.querySelector('.node.search-match');
      if (firstMatch) {
        firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
      }
    }
  }

  function clearSearch() {
    allNodeNames.forEach(({ element }) => {
      element.classList.remove('search-match', 'search-dimmed');
    });
    noResults.classList.remove('visible');
  }
}

// ── Breadcrumb on node click ──
function bindBreadcrumbs() {
  const container = document.querySelector('#tree-simple');
  const bar = ui.breadcrumb();

  container.addEventListener('click', e => {
    const nodeEl = e.target.closest('.node');
    if (!nodeEl) return;

    const card = nodeEl.querySelector('.family-card');
    if (!card) return;

    const clickedName = card.querySelector('.card-name')?.textContent;
    if (!clickedName) return;

    // Walk up the DOM to find ancestor nodes
    const path = buildBreadcrumbPath(clickedName);
    if (path.length > 0) {
      bar.innerHTML = path.map((name, i) => {
        const isLast = i === path.length - 1;
        const sep = i < path.length - 1
          ? ' <span class="breadcrumb-sep"><i class="fas fa-chevron-right"></i></span> '
          : '';
        const cls = isLast ? 'breadcrumb-item active' : 'breadcrumb-item';
        return `<span class="${cls}">${name}</span>${sep}`;
      }).join('');
      bar.classList.add('visible');
      // Scroll breadcrumb to show the active (last) item
      requestAnimationFrame(() => { bar.scrollLeft = bar.scrollWidth; });
    }
  });
}

function buildBreadcrumbPath(targetName) {
  // Search the tree data to find the path from root to target
  const path = [];
  function walk(node) {
    path.push(node._name);
    if (node._name === targetName) return true;
    if (node.children) {
      for (const child of node.children) {
        if (walk(child)) return true;
      }
    }
    path.pop();
    return false;
  }
  // Access tree from the Treant config
  if (treantInstance && treantInstance.tree && treantInstance.tree.initJsonConfig
      && treantInstance.tree.initJsonConfig.nodeStructure) {
    walk(treantInstance.tree.initJsonConfig.nodeStructure);
  }
  return path;
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  loadFamilyTree();
  // Retry button
  ui.retry().addEventListener('click', loadFamilyTree);
});
