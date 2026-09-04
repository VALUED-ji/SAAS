(function () {
  const root = document.documentElement;
  let tx = 0;
  let ty = 0;
  let x = 0;
  let y = 0;
  let raf = 0;
  function render() {
    x += (tx - x) * 0.085;
    y += (ty - y) * 0.085;
    root.style.setProperty("--mx", x.toFixed(4));
    root.style.setProperty("--my", y.toFixed(4));
    if (Math.abs(tx - x) > .001 || Math.abs(ty - y) > .001) raf = requestAnimationFrame(render);
    else raf = 0;
  }
  window.addEventListener("pointermove", function (event) {
    tx = (event.clientX / Math.max(window.innerWidth, 1) - .5) * 2;
    ty = (event.clientY / Math.max(window.innerHeight, 1) - .5) * 2;
    if (!raf) raf = requestAnimationFrame(render);
  }, { passive: true });
  window.addEventListener("pointerleave", function () {
    tx = 0;
    ty = 0;
    if (!raf) raf = requestAnimationFrame(render);
  });
})();
