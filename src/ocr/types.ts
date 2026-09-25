export interface Point {
  x: number;
  y: number;
}
export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface OCRLine {
  text: string;
  confidence: number;
  polygon: Point[];
  boundingBox: BoundingBox;
}
export interface OcrEngine {
  recognize(image: HTMLCanvasElement): Promise<OCRLine[]>;
}
