const CSV_URL = 'https://docs.google.com/spreadsheets/d/<YOUR_SHEET_ID>/export?format=csv';

async function loadFamilyTree() {
  try {
    const response = await fetch(CSV_URL, { cache: 'no-store' });
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
    collapseAll(familyConfig.nodeStructure);
    new Treant(familyConfig);
  } catch (err) {
    console.error('Failed to load family data', err);
  }
}

function buildHierarchy(rows) {
  const nodes = {};
  rows.forEach(row => {
    const name = row['Name'].trim();
    const spouse = row['Spouse'] ? row['Spouse'].trim() : '';
    const label = spouse ? `${name}\n+ ${spouse}` : name;
    nodes[name] = { text: { name: label } };
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

function collapseAll(node) {
  if (node.children && node.children.length) {
    node.collapsed = true;
    node.children.forEach(collapseAll);
  }
}

document.addEventListener('DOMContentLoaded', loadFamilyTree);
