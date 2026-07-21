// ARQUITETURA 4B: canvas frame orchestration. Individual drawing primitives
// remain supplied by the page, but their paint order and RAF coalescing live
// here as named layers, making the map's visual pipeline explicit and testable.
export function createCanvasRenderer({ canvas, ctx, getCamera, sceneSize, drawLayers, afterFrame, requestFrame = requestAnimationFrame, cancelFrame = cancelAnimationFrame }) {
  let frameId = 0;

  function draw() {
    const rect = canvas.getBoundingClientRect();
    const { w, h, g } = sceneSize();
    const camera = getCamera();
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.zoom, camera.zoom);
    const frame = { w, h, g };
    drawLayers.base(frame);
    drawLayers.grid(frame);
    drawLayers.terrain(frame);
    drawLayers.frame(frame);
    drawLayers.tokens(frame);
    drawLayers.movement(frame);
    drawLayers.visibility(frame);
    drawLayers.objects(frame);
    drawLayers.overlays(frame);
    ctx.restore();
    afterFrame(frame);
  }

  function schedule() {
    cancelFrame(frameId);
    frameId = requestFrame(draw);
  }

  return { draw, schedule };
}
