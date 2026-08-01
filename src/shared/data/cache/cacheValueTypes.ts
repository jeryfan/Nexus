/** Persisted window geometry used by WindowManager's bounds restoration. */
export type WindowBoundsState = {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
  displayBounds: { x: number; y: number; width: number; height: number }
}
