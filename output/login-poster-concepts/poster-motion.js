(function () {
  const root = document.documentElement;
  const motionHost = document.querySelector(".poster, .visual, .left, .board");
  if (motionHost && !motionHost.querySelector(".motion-orb")) {
    const orb = document.createElement("span");
    orb.className = "motion-orb";
    motionHost.insertBefore(orb, motionHost.firstChild);
  }

  let nextX = 0;
  let nextY = 0;
  let currentX = 0;
  let currentY = 0;
  let raf = 0;

  function paint() {
    currentX += (nextX - currentX) * 0.09;
    currentY += (nextY - currentY) * 0.09;
    root.style.setProperty("--tilt-x", currentX.toFixed(4));
    root.style.setProperty("--tilt-y", currentY.toFixed(4));
    root.style.setProperty("--pointer-x", `${Math.round(currentX * 180)}px`);
    root.style.setProperty("--pointer-y", `${Math.round(currentY * 140)}px`);
    if (Math.abs(nextX - currentX) > 0.001 || Math.abs(nextY - currentY) > 0.001) {
      raf = requestAnimationFrame(paint);
    } else {
      raf = 0;
    }
  }

  window.addEventListener("pointermove", function (event) {
    const width = Math.max(window.innerWidth, 1);
    const height = Math.max(window.innerHeight, 1);
    nextX = (event.clientX / width - 0.5) * 2;
    nextY = (event.clientY / height - 0.5) * 2;
    if (!raf) raf = requestAnimationFrame(paint);
  }, { passive: true });

  window.addEventListener("pointerleave", function () {
    nextX = 0;
    nextY = 0;
    if (!raf) raf = requestAnimationFrame(paint);
  });
})();
