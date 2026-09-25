export function rotateCanvas(input: HTMLCanvasElement, degrees: 90 | 180 | 270): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const sideways = degrees === 90 || degrees === 270;
  canvas.width = sideways ? input.height : input.width;
  canvas.height = sideways ? input.width : input.height;
  const ctx = canvas.getContext('2d')!;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(input, -input.width / 2, -input.height / 2);
  return canvas;
}
