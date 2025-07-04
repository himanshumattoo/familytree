const familyConfig = {
  chart: {
    container: "#tree-simple",
    rootOrientation: "NORTH",
    connectors: { type: "step" },
    node: { collapsable: true }
  },
  nodeStructure: {
    text: { name: "Pandit Shambhu Kachroo\n& Sobhagyawati" },
    children: [
      {
        text: { name: "Uday Chandan Kachroo\n+ Lalita" },
        children: [
          { text: { name: "Tej Bahadur K.\n+ Beena" } },
          { text: { name: "Prakash (Beema)\n+ Ashok Tickoo" } },
          { text: { name: "Ravinder K.\n+ Nimmi" } },
          { text: { name: "Indra (Jiji)\n+ Rashinder Trisal" } },
          { text: { name: "Savita Narayan K.\n+ Jeenak" } }
        ]
      },
      {
        text: { name: "Naginder Mohan Kachroo\n+ Rani" },
        children: [
          { text: { name: "Romesh (Sabtoth)\n+ Irene" } },
          { text: { name: "Vijay (Beenua)" } },
          { text: { name: "Bal Krishan (BK)" } }
        ]
      },
      {
        text: { name: "Rajdulari (Dida)\n+ Trilok Moza" },
        children: [
          { text: { name: "Kanaya Lal Moza\n+ Veera" } },
          { text: { name: "Asha Kaul\n+ Naresh" } },
          { text: { name: "Virender Moza (Veerji)\n+ Vijanti" } },
          { text: { name: "Meenakshi Moza (Kuku)" } }
        ]
      },
      {
        text: { name: "Sushil (Bengashi)\n+ Hidenath Pakmoo" },
        children: [
          { text: { name: "Renu Challu (Bala)\n+ Vijay Challu" } },
          { text: { name: "Rita Parimoo (Billi)" } },
          { text: { name: "Reeva Parimoo\n+ Rakesh Raina" } }
        ]
      },
      {
        text: { name: "Janwanti (Jygree)\n+ Omkar Nath Dhar" },
        children: [
          { text: { name: "Sarojni Sarla Kaul\n+ Deepak" } },
          { text: { name: "Shashi Kaul\n+ Ramesh Kaul" } },
          { text: { name: "Sudhir Dhar (Shaadi)\n+ Anita" } },
          { text: { name: "Sujata Mattoo\n+ Tej K." } }
        ]
      },
      {
        text: { name: "Dilaram Kachroo (Bobuji)\n+ Mohini" },
        children: [
          { text: { name: "Leela Dhar K." } },
          { text: { name: "Gayatri" } },
          { text: { name: "Vidya Dhar K.\n+ Andrea" } }
        ]
      },
      {
        text: { name: "Ishwer Chander Kachroo\n+ Pitabi" },
        children: [
          { text: { name: "Suman K.\n+ Ray Hoffpfieur" } },
          { text: { name: "Sachin K. (Raja)\n+ Pooja" } }
        ]
      }
    ]
  }
};

new Treant(familyConfig);
