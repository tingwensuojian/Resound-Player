// TS7016: three has its own types bundled, but vue-tsc doesn't resolve them
declare module 'three'

// TS7016: threejs-components has no types
declare module 'threejs-components/build/cursors/tubes1.min.js' {
  const createTubes: (options?: any) => {
    dispose: () => void
    render: (delta: number) => void
    resize: (w: number, h: number) => void
  }
  export default createTubes
}