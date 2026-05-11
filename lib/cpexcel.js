// Shim dla xlsx-js-style.min.js w środowisku Node.js.
// W przeglądarce ten moduł nie jest ładowany (nie ma `require`).
// W Node.js biblioteka próbuje doładować `./cpexcel.js` (codepages CP-936/950
// dla legacy XLS) — dla nowoczesnego XLSX (UTF-8) nieużywane.
// Pusty export wystarczy, aby `require('./cpexcel.js')` nie rzucał MODULE_NOT_FOUND.
module.exports = {};
