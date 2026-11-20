/* Pre-paint theme init — applies the saved theme (localStorage
   "sesemi-theme", shared with the main studio site) before first paint so
   there is no flash. Loaded synchronously from <head>; an external file
   passes the site CSP (script-src 'self') which an inline script would not. */
try {
  var saved = localStorage.getItem("sesemi-theme");
  document.documentElement.dataset.theme = saved === "light" ? "light" : "dark";
} catch (e) {
  document.documentElement.dataset.theme = "dark";
}
