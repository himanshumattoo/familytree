const fs = require('fs');

try {
  const date = new Date().toISOString();
  fs.writeFileSync('last-updated.txt', date + '\n');
  console.log('Updated last-updated.txt with', date);
} catch (err) {
  console.error('Failed to update timestamp', err);
  process.exit(1);
}
