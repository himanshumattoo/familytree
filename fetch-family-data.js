// Published Google Sheets CSV URL
const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSNHNHGEBkBF4U9tbRg4ab-wpxgNdm32BDMAujsUlf1FReLWgftUEQHt8oVZ6ZG5CFWmgUT2JQ_NLiD/pub?gid=0&single=true&output=csv';

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
let currentZoom = 1;
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.15;

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
      bindZoomControls();
      bindExpandToggle();
      bindDragToPan();
      bindBackButton();
      bindMinimap();
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
      if (toggle) {
        pushTreeState();
        toggle.click();
      }
    }
  });
}

// ── Search ──
let searchMatches = [];
let searchCurrentIndex = -1;

function bindSearch() {
  const input = ui.search();
  const box = ui.searchBox();
  const clearBtn = ui.clearBtn();
  const noResults = ui.noResults();
  const nav = document.getElementById('searchNav');
  const counter = document.getElementById('searchCounter');
  const prevBtn = document.getElementById('searchPrev');
  const nextBtn = document.getElementById('searchNext');
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
      if (searchMatches.length > 0) {
        navigateMatch(1);
      }
      input.blur();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    box.classList.remove('has-value');
    clearSearch();
    input.focus();
  });

  prevBtn.addEventListener('click', () => navigateMatch(-1));
  nextBtn.addEventListener('click', () => navigateMatch(1));

  function navigateMatch(direction) {
    if (searchMatches.length === 0) return;
    // Remove highlight from current
    if (searchCurrentIndex >= 0 && searchCurrentIndex < searchMatches.length) {
      searchMatches[searchCurrentIndex].classList.remove('search-active');
    }
    searchCurrentIndex = (searchCurrentIndex + direction + searchMatches.length) % searchMatches.length;
    const current = searchMatches[searchCurrentIndex];
    current.classList.add('search-active');
    current.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    updateCounter();
  }

  function updateCounter() {
    counter.textContent = searchMatches.length === 0
      ? '0 / 0'
      : `${searchCurrentIndex + 1} / ${searchMatches.length}`;
    prevBtn.disabled = searchMatches.length <= 1;
    nextBtn.disabled = searchMatches.length <= 1;
  }

  function performSearch(query) {
    if (!query) {
      clearSearch();
      return;
    }

    searchMatches = [];
    searchCurrentIndex = -1;

    allNodeNames.forEach(({ name, element }) => {
      if (name.includes(query)) {
        element.classList.add('search-match');
        element.classList.remove('search-dimmed');
        searchMatches.push(element);
      } else {
        element.classList.remove('search-match');
        element.classList.add('search-dimmed');
        element.classList.remove('search-active');
      }
    });

    noResults.classList.toggle('visible', searchMatches.length === 0);
    nav.classList.toggle('visible', searchMatches.length > 0);

    if (searchMatches.length > 0) {
      searchCurrentIndex = 0;
      searchMatches[0].classList.add('search-active');
      searchMatches[0].scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
    updateCounter();
  }

  function clearSearch() {
    searchMatches = [];
    searchCurrentIndex = -1;
    allNodeNames.forEach(({ element }) => {
      element.classList.remove('search-match', 'search-dimmed', 'search-active');
    });
    noResults.classList.remove('visible');
    nav.classList.remove('visible');
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
          ? ' <span class="breadcrumb-sep"><svg width="10" height="10" viewBox="0 0 320 512" fill="currentColor"><path d="M278.6 233.4c12.5 12.5 12.5 32.8 0 45.3l-160 160c-12.5 12.5-32.8 12.5-45.3 0s-12.5-32.8 0-45.3L210.7 256 73.4 118.6c-12.5-12.5-12.5-32.8 0-45.3s32.8-12.5 45.3 0l160 160z"/></svg></span> '
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

// ── Expand / Collapse All ──
let allExpanded = false;

function bindExpandToggle() {
  const btn = document.getElementById('expandToggle');
  btn.hidden = false;
  btn.addEventListener('click', toggleExpandAll);
}

function toggleExpandAll() {
  const btn = document.getElementById('expandToggle');
  const switches = document.querySelectorAll('#tree-simple .collapse-switch');
  if (allExpanded) {
    // Collapse all
    switches.forEach(sw => {
      const node = sw.closest('.node');
      if (node && !node.classList.contains('collapsed')) {
        sw.click();
      }
    });
    allExpanded = false;
    btn.innerHTML = '<svg viewBox="0 0 448 512"><path d="M256 80c0-17.7-14.3-32-32-32s-32 14.3-32 32v144H48c-17.7 0-32 14.3-32 32s14.3 32 32 32h144v144c0 17.7 14.3 32 32 32s32-14.3 32-32V288h144c17.7 0 32-14.3 32-32s-14.3-32-32-32H256V80z"/></svg><span>Expand All</span>';
    btn.title = 'Expand all nodes';
  } else {
    // Expand all
    switches.forEach(sw => {
      const node = sw.closest('.node');
      if (node && node.classList.contains('collapsed')) {
        sw.click();
      }
    });
    allExpanded = true;
    btn.innerHTML = '<svg viewBox="0 0 448 512"><path d="M432 256c0 17.7-14.3 32-32 32H48c-17.7 0-32-14.3-32-32s14.3-32 32-32h352c17.7 0 32 14.3 32 32z"/></svg><span>Collapse All</span>';
    btn.title = 'Collapse all nodes';
  }
}

// ── Zoom controls ──
function setZoom(level) {
  currentZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));
  const tree = document.getElementById('tree-simple');
  tree.style.transform = `scale(${currentZoom})`;
  document.getElementById('zoomLevel').textContent = Math.round(currentZoom * 100) + '%';
  document.getElementById('zoomIn').disabled = currentZoom >= ZOOM_MAX;
  document.getElementById('zoomOut').disabled = currentZoom <= ZOOM_MIN;
}

function zoomToFit() {
  const wrapper = document.getElementById('treeWrapper');
  const tree = document.getElementById('tree-simple');
  // Temporarily reset scale to measure natural size
  tree.style.transition = 'none';
  tree.style.transform = 'scale(1)';
  const treeW = tree.scrollWidth;
  const treeH = tree.scrollHeight;
  tree.style.transition = '';
  const wrapperW = wrapper.clientWidth - 48; // account for padding
  const wrapperH = wrapper.clientHeight - 48;
  const fit = Math.min(wrapperW / treeW, wrapperH / treeH, 1);
  setZoom(fit);
  // Center the tree after fitting
  wrapper.scrollLeft = 0;
  wrapper.scrollTop = 0;
}

function bindZoomControls() {
  const controls = document.getElementById('zoomControls');
  controls.hidden = false;

  document.getElementById('zoomIn').addEventListener('click', () => setZoom(currentZoom + ZOOM_STEP));
  document.getElementById('zoomOut').addEventListener('click', () => setZoom(currentZoom - ZOOM_STEP));
  document.getElementById('zoomReset').addEventListener('click', () => setZoom(1));
  document.getElementById('zoomFit').addEventListener('click', zoomToFit);

  // Ctrl+scroll / Cmd+scroll to zoom on desktop
  const wrapper = document.getElementById('treeWrapper');
  wrapper.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      setZoom(currentZoom + delta);
    }
  }, { passive: false });
}

// ── Android back-button / history navigation ──
let historyDepth = 0;

function pushTreeState() {
  historyDepth++;
  history.pushState({ treeAction: historyDepth }, '');
}

function bindBackButton() {
  window.addEventListener('popstate', (e) => {
    if (historyDepth > 0) {
      historyDepth--;
    }
    // If search is active, clear it
    const input = ui.search();
    if (input.value) {
      input.value = '';
      ui.searchBox().classList.remove('has-value');
      input.dispatchEvent(new Event('input'));
      return;
    }
    // If breadcrumb is visible, hide it
    const breadcrumb = ui.breadcrumb();
    if (breadcrumb.classList.contains('visible')) {
      breadcrumb.classList.remove('visible');
      breadcrumb.innerHTML = '';
      return;
    }
  });
}

// ── Minimap ──
function bindMinimap() {
  // Only show on desktop (wide screens)
  if (window.innerWidth < 768) return;

  const minimap = document.getElementById('minimap');
  const viewport = document.getElementById('minimapViewport');
  const content = document.getElementById('minimapContent');
  const wrapper = document.getElementById('treeWrapper');
  const tree = document.getElementById('tree-simple');

  function updateMinimap() {
    const treeW = tree.scrollWidth * currentZoom;
    const treeH = tree.scrollHeight * currentZoom;
    const wrapperW = wrapper.clientWidth;
    const wrapperH = wrapper.clientHeight;

    // Only show minimap if tree is larger than viewport
    if (treeW <= wrapperW && treeH <= wrapperH) {
      minimap.classList.remove('visible');
      return;
    }
    minimap.classList.add('visible');

    const mapW = minimap.clientWidth;
    const mapH = minimap.clientHeight;
    const scaleX = mapW / treeW;
    const scaleY = mapH / treeH;
    const scale = Math.min(scaleX, scaleY);

    // Draw dots for each node
    const nodes = tree.querySelectorAll('.node');
    let dots = '';
    nodes.forEach(node => {
      const x = (node.offsetLeft * currentZoom) * scale;
      const y = (node.offsetTop * currentZoom) * scale;
      const w = Math.max(3, node.offsetWidth * currentZoom * scale);
      const h = Math.max(2, node.offsetHeight * currentZoom * scale);
      const color = node.classList.contains('search-match') ? 'var(--accent)' : 'var(--border-light)';
      dots += `<div style="position:absolute;left:${x}px;top:${y}px;width:${w}px;height:${h}px;background:${color};border-radius:1px;"></div>`;
    });
    content.innerHTML = dots;

    // Viewport rectangle
    const vpW = wrapperW * scale;
    const vpH = wrapperH * scale;
    const vpX = wrapper.scrollLeft * scale;
    const vpY = wrapper.scrollTop * scale;
    viewport.style.width = Math.min(vpW, mapW) + 'px';
    viewport.style.height = Math.min(vpH, mapH) + 'px';
    viewport.style.left = vpX + 'px';
    viewport.style.top = vpY + 'px';
  }

  // Click on minimap to navigate
  minimap.addEventListener('click', (e) => {
    const rect = minimap.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;
    const mapW = minimap.clientWidth;
    const mapH = minimap.clientHeight;
    const treeW = tree.scrollWidth * currentZoom;
    const treeH = tree.scrollHeight * currentZoom;
    const scaleX = mapW / treeW;
    const scaleY = mapH / treeH;
    const scale = Math.min(scaleX, scaleY);

    wrapper.scrollLeft = (clickX / scale) - (wrapper.clientWidth / 2);
    wrapper.scrollTop = (clickY / scale) - (wrapper.clientHeight / 2);
  });

  wrapper.addEventListener('scroll', updateMinimap);
  window.addEventListener('resize', updateMinimap);
  // Initial render after a brief delay for Treant layout
  setTimeout(updateMinimap, 500);
  // Also update when zoom changes
  const origSetZoom = setZoom;
  setZoom = function(level) {
    origSetZoom(level);
    setTimeout(updateMinimap, 200);
  };
}

// ── Drag-to-pan (desktop) ──
function bindDragToPan() {
  const wrapper = document.getElementById('treeWrapper');
  let isDragging = false;
  let startX, startY, scrollLeft, scrollTop;

  wrapper.addEventListener('mousedown', (e) => {
    // Only pan on primary button, and not on interactive elements
    if (e.button !== 0) return;
    if (e.target.closest('.node, .collapse-switch, button, input, a')) return;

    isDragging = true;
    wrapper.classList.add('is-dragging');
    startX = e.clientX;
    startY = e.clientY;
    scrollLeft = wrapper.scrollLeft;
    scrollTop = wrapper.scrollTop;
    e.preventDefault();
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    wrapper.scrollLeft = scrollLeft - dx;
    wrapper.scrollTop = scrollTop - dy;
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      wrapper.classList.remove('is-dragging');
    }
  });
}

// ── Keyboard shortcuts ──
function bindKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    const input = ui.search();
    const isSearchFocused = document.activeElement === input;

    // "/" or Ctrl/Cmd+F → focus search
    if ((e.key === '/' && !isSearchFocused) ||
        ((e.ctrlKey || e.metaKey) && e.key === 'f')) {
      e.preventDefault();
      input.focus();
      input.select();
      return;
    }

    // Escape → clear search and blur
    if (e.key === 'Escape') {
      if (isSearchFocused || input.value) {
        e.preventDefault();
        input.value = '';
        ui.searchBox().classList.remove('has-value');
        // Trigger search clear
        input.dispatchEvent(new Event('input'));
        input.blur();
        return;
      }
    }

    // Skip remaining shortcuts when typing in search
    if (isSearchFocused) return;

    // Ctrl/Cmd + = → zoom in
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      setZoom(currentZoom + ZOOM_STEP);
      return;
    }

    // Ctrl/Cmd + - → zoom out
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      setZoom(currentZoom - ZOOM_STEP);
      return;
    }

    // Ctrl/Cmd + 0 → reset zoom
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      setZoom(1);
      return;
    }

    // e → expand all, c → collapse all (single keys when not in search)
    if (e.key === 'e' && !e.ctrlKey && !e.metaKey) {
      if (!allExpanded) toggleExpandAll();
      return;
    }
    if (e.key === 'c' && !e.ctrlKey && !e.metaKey) {
      if (allExpanded) toggleExpandAll();
      return;
    }
  });
}

// ── Dark mode ──
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
  // Update theme-color meta tag
  updateThemeColor();

  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeColor();
  });
}

function updateThemeColor() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#0F172A' : '#FFFFFF';
}

// ── Service Worker registration ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadFamilyTree();
  ui.retry().addEventListener('click', loadFamilyTree);
  bindKeyboardShortcuts();
});
