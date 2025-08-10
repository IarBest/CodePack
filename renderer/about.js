document.addEventListener('DOMContentLoaded', async () => {
  // Запрашиваем тему и переводы из основного процесса
  const theme = await window.api.getConfig('ui.theme', 'light');
  const translations = await window.api.getTranslations();

  // Применяем тему к окну
  document.documentElement.classList.toggle('dark-theme', theme === 'dark');

  // Применяем переводы
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (translations[key]) {
      el.textContent = translations[key];
    }
  });
  document.title = translations.about_new_title || 'About';

  // Назначаем действия кнопкам
  document.getElementById('websiteBtn').addEventListener('click', () => {
    window.api.openExternalLink('https://iarbest.ru');
  });

  document.getElementById('repoBtn').addEventListener('click', () => {
    window.api.openExternalLink('https://github.com/IarBest/CodePack');
  });

  document.getElementById('emailBtn').addEventListener('click', () => {
    window.api.openExternalLink('mailto:iar_best@mail.ru');
  });

  document.getElementById('paypalBtn').addEventListener('click', () => {
    window.api.openExternalLink('https://paypal.me/iarbest');
  });

  document.getElementById('boostyBtn').addEventListener('click', () => {
    window.api.openExternalLink('https://boosty.to/iarbest');
  });
});
