const toggleBtn = document.getElementById('theme-toggle');

function applyTheme(theme) {
  document.body.classList.toggle('dark-mode', theme === 'dark');
}

function initTheme() {
  const stored = localStorage.getItem('theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = stored || (prefersDark ? 'dark' : 'light');
  applyTheme(theme);
}

if (toggleBtn) {
  toggleBtn.addEventListener('click', () => {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  });
}

initTheme();

