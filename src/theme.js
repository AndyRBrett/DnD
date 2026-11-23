// Applies the theme saved on this phone before the page draws (a classic
// script in <head>, so there's no flash of the default colors). The picker on
// the Sheet tab and in the lobby calls window.dndSetTheme.
(function () {
  var THEMES = { arena: "#0e0f12", parchment: "#efe6d2", arcane: "#0b0d1a", wildwood: "#0d1410" };
  function apply(name) {
    if (!THEMES[name]) name = "arena";
    document.documentElement.dataset.theme = name;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", THEMES[name]);
    return name;
  }
  var saved = null;
  try { saved = localStorage.getItem("dnd-theme"); } catch (error) {}
  apply(saved);
  window.dndSetTheme = function (name) {
    name = apply(name);
    try { localStorage.setItem("dnd-theme", name); } catch (error) {}
    return name;
  };
})();
