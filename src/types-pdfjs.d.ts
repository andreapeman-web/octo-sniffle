declare module "pdfjs-dist/build/pdf" {
  export const GlobalWorkerOptions: { workerSrc: string };
  export function getDocument(src: { data: Uint8Array; isEvalSupported?: boolean }): {
    promise: Promise<{
      numPages: number;
      getPage(n: number): Promise<{
        getViewport(o: { scale: number }): { width: number; height: number };
        getTextContent(): Promise<{ items: unknown[] }>;
        render(o: unknown): { promise: Promise<void> };
        cleanup(): void;
      }>;
    }>;
  };
}
declare module "*?raw" {
  const s: string;
  export default s;
}
