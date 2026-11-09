// Small shared set for the primary controls; no external font or icon dependency.
const lifeIconPaths={
 home:'<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
 plans:'<rect x="4" y="5" width="16" height="16" rx="3"/><path d="M8 3v4m8-4v4M4 11h16m-11 4h2m3 0h1"/>',
 review:'<path d="M3 11a9 9 0 1 1 2.6 7M3 4v7h7m2-4v5l3 2"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
 mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v1a7 7 0 0 0 14 0v-1m-7 8v4m-4 0h8"/>',
 stop:'<rect x="6" y="6" width="12" height="12" rx="2"/>',
 send:'<path d="m5 12 7-7 7 7m-7-7v16"/>',
 close:'<path d="m6 6 12 12M6 18 18 6"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>'
};
function lifeIcon(name){return `<svg class="life-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${lifeIconPaths[name]||lifeIconPaths.arrow}</svg>`}
