const familyConfig = {
  chart: {
    container: "#tree-simple",
    rootOrientation: "NORTH",
    connectors: { type: "step" },
    node: { collapsable: true }
  },
  nodeStructure: {
    text: { name: "Pandit Shambhu Kachroo" },
    children: [
      {
        text: { name: "Uday Chandan Kachroo" },
        children: [
          { text: { name: "Tej Bahadur K." } },
          { text: { name: "Prakash (Beema)" } }
        ]
      },
      {
        text: { name: "Naginder Mohan Kachroo" },
        children: [
          { text: { name: "Romesh (Sabtoth)" } }
        ]
      }
    ]
  }
};

new Treant(familyConfig);
