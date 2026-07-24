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
    const response = await fetch('/api/family-data', { credentials: 'same-origin' });
    if (response.status === 401) {
      showPasswordGate();
      return;
    }
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
      bindPointerGestures();
      bindBackButton();
      bindMinimap();
      bindScrollToRoot();
      // Auto-fit tree to viewport on mobile for immediate visibility
      if (window.innerWidth <= 768) {
        setTimeout(zoomToFit, 300);
      }
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
  document.getElementById('passwordGate').hidden = true;
}

function showError() {
  ui.loading().style.display = 'none';
  ui.error().style.display = 'flex';
  ui.wrapper().style.display = 'none';
  document.getElementById('passwordGate').hidden = true;
}

function showTree() {
  ui.loading().style.display = 'none';
  ui.error().style.display = 'none';
  ui.wrapper().style.display = '';
  document.getElementById('passwordGate').hidden = true;
}

function showPasswordGate() {
  ui.loading().style.display = 'none';
  ui.error().style.display = 'none';
  ui.wrapper().style.display = 'none';
  document.getElementById('passwordGate').hidden = false;
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
  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  container.addEventListener('click', e => {
    const nodeEl = e.target.closest('.node');
    if (!nodeEl || e.target.classList.contains('collapse-switch')) return;

    // On mobile, toggle card detail visibility
    if (isMobile) {
      const card = nodeEl.querySelector('.family-card');
      if (card) card.classList.toggle('expanded');
    }

    const toggle = nodeEl.querySelector('.collapse-switch');
    if (toggle) {
      pushTreeState();
      toggle.click();
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
function setZoom(level, focalX, focalY) {
  const wrapper = document.getElementById('treeWrapper');
  const tree = document.getElementById('tree-simple');
  const oldZoom = currentZoom;
  currentZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, level));

  // Focal-point zoom: keep the point under (focalX, focalY) stationary
  const cx = focalX !== undefined ? focalX : wrapper.clientWidth / 2;
  const cy = focalY !== undefined ? focalY : wrapper.clientHeight / 2;
  const contentX = (wrapper.scrollLeft + cx) / oldZoom;
  const contentY = (wrapper.scrollTop + cy) / oldZoom;

  tree.style.transform = `scale(${currentZoom})`;
  wrapper.scrollLeft = contentX * currentZoom - cx;
  wrapper.scrollTop = contentY * currentZoom - cy;

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
  currentZoom = 1; // sync state so setZoom's focal-point math is correct
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

  // Ctrl+scroll / Cmd+scroll to zoom on desktop (focal point at cursor)
  const wrapper = document.getElementById('treeWrapper');
  wrapper.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const rect = wrapper.getBoundingClientRect();
      setZoom(currentZoom + delta, e.clientX - rect.left, e.clientY - rect.top);
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
  setZoom = function(level, focalX, focalY) {
    origSetZoom(level, focalX, focalY);
    setTimeout(updateMinimap, 200);
  };
}

// ── Unified pointer-driven pan, pinch-zoom, inertia & double-tap ──
function bindPointerGestures() {
  const wrapper = document.getElementById('treeWrapper');
  const pointers = new Map();

  // Pan state
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let panScrollLeft = 0, panScrollTop = 0;

  // Velocity / inertia
  let velocityX = 0, velocityY = 0, lastMoveTime = 0;
  let inertiaFrame = null;

  // Pinch state
  let isPinching = false;
  let pinchStartDist = 0;
  let pinchStartZoom = 1;

  // Double-tap state (touch only)
  let lastTapTime = 0;
  let tapDownX = 0, tapDownY = 0, tapDownTime = 0;

  function cancelInertia() {
    if (inertiaFrame) { cancelAnimationFrame(inertiaFrame); inertiaFrame = null; }
  }

  function pDist(a, b) {
    const dx = a.x - b.x, dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  wrapper.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    cancelInertia();

    const onInteractive = e.target.closest('.node, .collapse-switch, button, input, a');

    if (pointers.size === 1 && !onInteractive) {
      isPanning = true;
      wrapper.setPointerCapture(e.pointerId);
      panStartX = e.clientX;
      panStartY = e.clientY;
      panScrollLeft = wrapper.scrollLeft;
      panScrollTop = wrapper.scrollTop;
      velocityX = 0;
      velocityY = 0;
      lastMoveTime = performance.now();
      tapDownX = e.clientX;
      tapDownY = e.clientY;
      tapDownTime = Date.now();
      wrapper.classList.add('is-dragging');
    }

    if (pointers.size === 2) {
      // Switch to pinch
      isPanning = false;
      isPinching = true;
      wrapper.classList.remove('is-dragging');
      const pts = Array.from(pointers.values());
      pinchStartDist = pDist(pts[0], pts[1]);
      pinchStartZoom = currentZoom;
      for (const id of pointers.keys()) {
        try { wrapper.setPointerCapture(id); } catch (_) {}
      }
    }
  });

  wrapper.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (isPanning && pointers.size === 1) {
      const now = performance.now();
      const dt = now - lastMoveTime;
      if (dt > 0) {
        velocityX = (e.clientX - prev.x) / dt * 16;
        velocityY = (e.clientY - prev.y) / dt * 16;
      }
      lastMoveTime = now;
      wrapper.scrollLeft = panScrollLeft - (e.clientX - panStartX);
      wrapper.scrollTop = panScrollTop - (e.clientY - panStartY);
    } else if (isPinching && pointers.size === 2) {
      e.preventDefault();
      const pts = Array.from(pointers.values());
      const dist = pDist(pts[0], pts[1]);
      const scale = dist / pinchStartDist;
      const rect = wrapper.getBoundingClientRect();
      const fx = (pts[0].x + pts[1].x) / 2 - rect.left;
      const fy = (pts[0].y + pts[1].y) / 2 - rect.top;
      setZoom(pinchStartZoom * scale, fx, fy);
    }
  });

  function onPointerEnd(e) {
    pointers.delete(e.pointerId);
    try { wrapper.releasePointerCapture(e.pointerId); } catch (_) {}

    if (pointers.size === 0) {
      if (isPanning) {
        isPanning = false;
        wrapper.classList.remove('is-dragging');

        // Inertia coast
        if (Math.abs(velocityX) > 0.5 || Math.abs(velocityY) > 0.5) {
          (function coast() {
            velocityX *= 0.92;
            velocityY *= 0.92;
            wrapper.scrollLeft -= velocityX;
            wrapper.scrollTop -= velocityY;
            if (Math.abs(velocityX) > 0.5 || Math.abs(velocityY) > 0.5) {
              inertiaFrame = requestAnimationFrame(coast);
            } else { inertiaFrame = null; }
          })();
        }

        // Double-tap detection (touch only, empty space only)
        if (e.pointerType === 'touch') {
          const dt = Date.now() - tapDownTime;
          const dx = Math.abs(e.clientX - tapDownX);
          const dy = Math.abs(e.clientY - tapDownY);
          if (dt < 300 && dx < 10 && dy < 10) {
            const now = Date.now();
            if (now - lastTapTime < 350) {
              const rect = wrapper.getBoundingClientRect();
              const fx = e.clientX - rect.left;
              const fy = e.clientY - rect.top;
              setZoom(currentZoom > 1.05 ? 1 : 1.5, fx, fy);
              lastTapTime = 0;
            } else {
              lastTapTime = now;
            }
          }
        }
      }
      isPinching = false;
    } else if (pointers.size === 1 && isPinching) {
      // Transitioned from pinch → single pointer: start panning
      isPinching = false;
      isPanning = true;
      const p = Array.from(pointers.values())[0];
      const id = Array.from(pointers.keys())[0];
      panStartX = p.x;
      panStartY = p.y;
      panScrollLeft = wrapper.scrollLeft;
      panScrollTop = wrapper.scrollTop;
      velocityX = 0;
      velocityY = 0;
      lastMoveTime = performance.now();
      try { wrapper.setPointerCapture(id); } catch (_) {}
      wrapper.classList.add('is-dragging');
    }
  }

  wrapper.addEventListener('pointerup', onPointerEnd);
  wrapper.addEventListener('pointercancel', onPointerEnd);
}

// ── Scroll-to-root (mobile) ──
function bindScrollToRoot() {
  if (window.innerWidth > 768) return;

  const btn = document.getElementById('scrollToRoot');
  const wrapper = document.getElementById('treeWrapper');

  // Show/hide based on scroll position
  let scrollTimer;
  wrapper.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const scrolled = wrapper.scrollTop > 150 || wrapper.scrollLeft > 150;
      btn.classList.toggle('visible', scrolled);
    }, 100);
  }, { passive: true });

  btn.addEventListener('click', () => {
    wrapper.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    btn.classList.remove('visible');
  });

  // Re-evaluate on orientation change
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      // Recalculate scroll position after orientation settles
      btn.classList.toggle('visible', wrapper.scrollTop > 150 || wrapper.scrollLeft > 150);
    }, 300);
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

// ── Password gate ──
// Real auth now happens server-side in functions/api/login.js; this just
// posts the password and relies on the httpOnly session cookie it sets.
function initPasswordGate() {
  const gate = document.getElementById('passwordGate');
  const form = document.getElementById('gateForm');
  const input = document.getElementById('gateInput');
  const error = document.getElementById('gateError');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: input.value }),
      });

      if (res.ok) {
        gate.hidden = true;
        loadFamilyTree();
        return;
      }

      const data = await res.json().catch(() => ({}));
      error.textContent = res.status === 429
        ? 'Too many attempts. Please wait a few minutes and try again.'
        : (data.error || 'Incorrect password. Please try again.');
      input.value = '';
      input.focus();
      form.classList.remove('shake');
      void form.offsetWidth; // reflow to restart animation
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 600);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
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
  document.querySelector('meta[name="theme-color"]').content = isDark ? '#0E1218' : '#F9F5EF';
}

// ── Service Worker registration ──
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPasswordGate();
  loadFamilyTree(); // shows the password gate itself if the session isn't authenticated
  ui.retry().addEventListener('click', loadFamilyTree);
  bindKeyboardShortcuts();
});
