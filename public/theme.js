// ================================
// THEME TOGGLE LOGIC
//
// This script runs after the page has loaded.
// It wires up the toggle button to flip between
// light and dark mode, saving the choice in localStorage.
// ================================

(function () {
    const toggle = document.querySelector('.theme-toggle');
    if (!toggle) return;

    // Update the button icon and aria-label to match the current theme
    function updateToggle() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        toggle.textContent = isDark ? '\u2600' : '\u263E';  // sun or moon
        toggle.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    toggle.addEventListener('click', function () {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const newTheme = isDark ? 'light' : 'dark';

        // Add transition class so colors fade smoothly
        document.body.classList.add('theme-transition');

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        updateToggle();

        // Remove the transition class after the animation finishes
        // so it doesn't interfere with other transitions on the page
        setTimeout(function () {
            document.body.classList.remove('theme-transition');
        }, 350);
    });

    // Set initial icon on page load
    updateToggle();
})();
