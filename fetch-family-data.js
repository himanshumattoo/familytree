// Published Google Sheets CSV URL
const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSNHNHGEBkBF4U9tbRg4ab-wpxgNdm32BDMAujsUlf1FReLWgftUEQHt8oVZ6ZG5CFWmgUT2JQ_NLiD/pub?gid=0&single=true&output=csv';

async function loadFamilyTree() {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error('Network response was not ok');
    const csvText = await response.text();
    const rows = Papa.parse(csvText, { header: true, skipEmptyLines: true }).data;
    const tree = buildHierarchy(rows);
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
    new Treant(familyConfig, () => {
      const container = document.querySelector('#tree-simple');
      container.addEventListener('click', e => {
        const nodeEl = e.target.closest('.node');
        if (nodeEl && !e.target.classList.contains('collapse-switch')) {
          const toggle = nodeEl.querySelector('.collapse-switch');
          if (toggle) toggle.click();
        }
      });
    });
  } catch (err) {
    console.error('Failed to load family data', err);
  }
}

function createCard(row) {
  const name = row['Name'] ? row['Name'].trim() : '';
  const details = Object.keys(row)
    .filter(k => k !== 'Name' && k !== 'Parent' && row[k] && row[k].trim())
    .map(k => `<div><strong>${k}:</strong> ${row[k].trim()}</div>`) 
    .join('');
  return `
    <div class="family-card">
      <div class="card-name">${name}</div>
      ${details}
    </div>
  `;
}

function buildHierarchy(rows) {
  const nodes = {};
  rows.forEach(row => {
    const name = row['Name'].trim();
    nodes[name] = { innerHTML: createCard(row) };
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

function collapseChildren(node) {
  if (node.children && node.children.length) {
    node.children.forEach(child => {
      child.collapsed = true;
      collapseChildren(child);
    });
  }
}

document.addEventListener('DOMContentLoaded', loadFamilyTree);
