// Main application JavaScript
// Most functionality is inline in the EJS templates for simplicity
// This file can be extended for shared utilities

document.addEventListener('DOMContentLoaded', () => {
  // Global search handler (available on all pages)
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && searchInput.value.trim()) {
        // Navigate to home with search query
        window.location.href = '/?q=' + encodeURIComponent(searchInput.value.trim());
      }
    });
  }

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Press '/' to focus search
    if (e.key === '/' && !e.target.matches('input, textarea')) {
      e.preventDefault();
      const search = document.getElementById('searchInput');
      if (search) search.focus();
    }

    // Press 'Escape' to blur search
    if (e.key === 'Escape') {
      document.activeElement.blur();
    }
  });
});
