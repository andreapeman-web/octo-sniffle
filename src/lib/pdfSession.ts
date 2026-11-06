// The module PDF opened in this visit (kept in memory only, never stored), so
// pictures can be cropped from it in the art checklist.
let doc: unknown = null;
export const getModulePdf = () => doc;
export const setModulePdf = (d: unknown) => {
  doc = d;
};
