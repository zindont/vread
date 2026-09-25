import { VReadError } from '../core/errors';
import type { ImageInput } from '../core/types';
export async function normalizeImage(
  input: ImageInput,
  maxSide = 1800,
): Promise<HTMLCanvasElement> {
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  if (input instanceof Blob) {
    try {
      const bitmap = await createImageBitmap(input, { imageOrientation: 'from-image' });
      source = bitmap;
      width = bitmap.width;
      height = bitmap.height;
    } catch (cause) {
      throw new VReadError('UNSUPPORTED_INPUT', 'Could not decode image', cause);
    }
  } else if (input instanceof ImageData) {
    const temp = document.createElement('canvas');
    temp.width = input.width;
    temp.height = input.height;
    temp.getContext('2d')!.putImageData(input, 0, 0);
    source = temp;
    width = input.width;
    height = input.height;
  } else if (input instanceof HTMLCanvasElement) {
    source = input;
    width = input.width;
    height = input.height;
  } else if (input instanceof HTMLImageElement) {
    if (!input.complete) await input.decode();
    source = input;
    width = input.naturalWidth;
    height = input.naturalHeight;
  } else if (typeof ImageBitmap !== 'undefined' && input instanceof ImageBitmap) {
    source = input;
    width = input.width;
    height = input.height;
  } else
    throw new VReadError(
      'UNSUPPORTED_INPUT',
      'Expected a Blob, File, ImageData, image, canvas, or ImageBitmap',
    );
  if (!width || !height) throw new VReadError('UNSUPPORTED_INPUT', 'Image is empty');
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if (input instanceof Blob && source instanceof ImageBitmap) source.close();
  return canvas;
}
