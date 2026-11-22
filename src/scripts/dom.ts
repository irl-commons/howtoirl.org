// These elements belong to markup produced by the same build as the script.
type ElementClass<T extends HTMLElement> = { new (): T };

export function requireElement(root: ParentNode, selector: string): HTMLElement;
export function requireElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  type: ElementClass<T>,
): T;
export function requireElement(root: ParentNode, selector: string, type = HTMLElement) {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) throw new Error("Missing or unexpected element: " + selector);
  return element;
}

export function requireId(id: string): HTMLElement;
export function requireId<T extends HTMLElement>(id: string, type: ElementClass<T>): T;
export function requireId(id: string, type = HTMLElement) {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error("Missing or unexpected element: #" + id);
  return element;
}
