import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { FramebufferTexture, LinearFilter, Mesh, OrthographicCamera, PlaneGeometry, Scene, ShaderMaterial, Vector2 } from 'three'

import { gameState } from '../store/gameStore'
import { speedFeel, updateSpeedFeel } from './speedFeel'

/**
 * Speed blur: a zoom blur streaking out from where the rider is heading,
 * strongest down both sides of the screen and clear in the middle, growing
 * with speed and pulsing on every jump.
 *
 * The scene is rendered normally; when the blur is on, the finished frame is
 * copied into a texture and drawn back over the screen through the blur shader,
 * so the game looks exactly the same whenever you're riding slowly. On Low
 * graphics it only keeps `speedFeel` up to date (the lines and camera use it).
 */

const SAMPLES = 10

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform sampler2D tFrame;
  uniform vec2 focus;
  uniform float strength;
  varying vec2 vUv;

  void main() {
    vec2 dir = vUv - focus;
    // Clear around the rider, blurring more towards the left and right edges.
    float edge = length(vec2(dir.x * 1.25, dir.y * 0.8));
    float mask = smoothstep(0.16, 0.62, edge);
    float amount = strength * mask * 0.16;
    // The clear middle (most of the screen at lower speeds) skips the blur loop.
    if (amount < 0.002) {
      gl_FragColor = vec4(texture2D(tFrame, vUv).rgb, 1.0);
      return;
    }
    vec3 sum = vec3(0.0);
    float total = 0.0;
    for (int i = 0; i < ${SAMPLES}; i++) {
      float t = float(i) / float(${SAMPLES - 1});
      float w = 1.0 - t * 0.6;
      sum += texture2D(tFrame, focus + dir * (1.0 - amount * t)).rgb * w;
      total += w;
    }
    vec3 color = sum / total;
    // A faint cool glow where the streaks are strongest.
    color += vec3(0.05, 0.07, 0.09) * mask * strength;
    gl_FragColor = vec4(color, 1.0);
  }
`

/** The full-screen blur pass: copies the finished frame and draws it back blurred. */
function createBlurPass() {
  const material = new ShaderMaterial({
    uniforms: { tFrame: { value: null }, focus: { value: new Vector2(0.5, 0.5) }, strength: { value: 0 } },
    vertexShader,
    fragmentShader,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  })
  const quad = new Mesh(new PlaneGeometry(2, 2), material)
  quad.frustumCulled = false
  const scene = new Scene()
  scene.add(quad)
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1)
  let frame = null

  return {
    /** Matches the copy texture to the drawing buffer (call after a resize). */
    resize(renderer) {
      const buffer = renderer.getDrawingBufferSize(new Vector2())
      if (frame && frame.image.width === buffer.x && frame.image.height === buffer.y) return
      frame?.dispose()
      frame = new FramebufferTexture(buffer.x, buffer.y)
      frame.minFilter = LinearFilter
      frame.magFilter = LinearFilter
    },
    render(renderer, strength, focusX, focusY) {
      if (!frame) this.resize(renderer)
      renderer.copyFramebufferToTexture(frame)
      material.uniforms.tFrame.value = frame
      material.uniforms.focus.value.set(focusX, focusY)
      material.uniforms.strength.value = strength
      const autoClear = renderer.autoClear
      renderer.autoClear = false
      renderer.render(scene, camera)
      renderer.autoClear = autoClear
    },
    dispose() {
      frame?.dispose()
      material.dispose()
      quad.geometry.dispose()
    },
  }
}

export function SpeedBlur() {
  const gl = useThree((s) => s.gl)
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const pass = useMemo(() => createBlurPass(), [])
  useEffect(() => () => pass.dispose(), [pass])
  // Size and pixel ratio change the drawing buffer the frame is copied from.
  useEffect(() => pass.resize(gl), [pass, gl, size.width, size.height, dpr])

  // Priority 1: this callback renders the frame (R3F stops auto-rendering).
  useFrame((state, delta) => {
    const renderer = state.gl
    const dt = Math.min(delta, 0.05)
    updateSpeedFeel(state.camera, dt)
    renderer.render(state.scene, state.camera)

    const strength = Math.min(1.25, speedFeel.amount * (0.9 + 0.5 * speedFeel.kick))
    if (strength < 0.02 || gameState().settings.quality === 'low') return
    pass.render(renderer, strength, speedFeel.focusX, speedFeel.focusY)
  }, 1)

  return null
}

export default SpeedBlur
