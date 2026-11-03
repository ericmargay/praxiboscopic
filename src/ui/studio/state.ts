// Estado efímero del editor (no se guarda en el proyecto): herramienta activa, selección, onion skin, auto-key,
// modo de edición por fotograma, vista (zoom y desplazamiento) y keyframe seleccionado. Emite cambios a los paneles.

export type Tool = 'select' | 'circle' | 'rect' | 'polygon' | 'line' | 'path' | 'text' | 'image' | 'model3d';

export const TOOL_LABELS: Record<Tool, string> = {
  select: 'Seleccionar (V)',
  circle: 'Círculo (C)',
  rect: 'Rectángulo (R)',
  polygon: 'Polígono (P)',
  line: 'Línea (L)',
  path: 'Trazado Bézier (B)',
  text: 'Texto (T)',
  image: 'Imagen (PNG/JPG/SVG)',
  model3d: 'Modelo 3D (glTF/GLB)',
};

export const TOOL_ICONS: Record<Tool, string> = { select: '↖', circle: '◯', rect: '▭', polygon: '⬠', line: '╱', path: '∿', text: 'T', image: '🖼', model3d: '⬢' };

export interface SelectedKey {
  itemId: string;
  path: string;
  /** instante del keyframe (s) */
  t: number;
}

export interface EditorState {
  tool: Tool;
  selectedItemId: string | null;
  selectedLayerId: string | null;
  onionSkin: boolean;
  onionCount: number;
  autoKey: boolean;
  /** las ediciones van al fotograma actual (frameOverrides) */
  frameEdit: boolean;
  view: { scale: number; ox: number; oy: number };
  selectedKey: SelectedKey | null;
  /** mensaje de estado del editor */
  status: string;
}

type Listener = (s: EditorState) => void;

export class EditorStore {
  private state: EditorState = {
    tool: 'select',
    selectedItemId: null,
    selectedLayerId: null,
    onionSkin: false,
    onionCount: 1,
    autoKey: true,
    frameEdit: false,
    view: { scale: 1, ox: 0, oy: 0 },
    selectedKey: null,
    status: '',
  };
  private listeners = new Set<Listener>();

  get(): EditorState {
    return this.state;
  }

  patch(partial: Partial<EditorState>): void {
    this.state = { ...this.state, ...partial };
    for (const l of this.listeners) l(this.state);
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  setStatus(msg: string): void {
    this.patch({ status: msg });
  }
}
