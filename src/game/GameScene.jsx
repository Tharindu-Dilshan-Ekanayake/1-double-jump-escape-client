import { PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef, useState } from 'react'
import { NeutralToneMapping } from 'three'

import { sound } from '../audio/sound'
import { useBloxity } from '../bloxity/BloxityContext'
import { send } from '../net/connection'
import { getLayout } from '../shared/layout.js'
import { useGameStore } from '../store/gameStore'
import { cameraRig } from './cameraRig'
import FollowCamera from './FollowCamera'
import { input, installKeyboard } from './input'
import LocalPlayer from './LocalPlayer'
import Particles from './Particles'
import { localPlayer } from './playerState'
import RemotePlayers from './RemotePlayers'
import SpeedBlur from './SpeedBlur'
import Sky from './world/Sky'
import Weather from './world/Weather'
import World from './world/World'

/** Highest render resolution (device pixels per CSS pixel) per graphics setting. */
const MAX_DPR = { high: 1.5, medium: 1.15, low: 0.85 }

/** Canvas signs are drawn with the game fonts, so wait for them (briefly). */
function useFontsReady() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      setReady(true)
    }
    Promise.all([document.fonts.load('700 64px "Fredoka"'), document.fonts.load('400 64px "Luckiest Guy"')]).then(finish, finish)
    const timer = setTimeout(finish, 3000)
    return () => clearTimeout(timer)
  }, [])
  return ready
}

/** Sun + sky light. The shadow camera follows the player so shadows stay crisp. */
function Lights({ shadowSize }) {
  const light = useRef(null)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    const l = light.current
    scene.add(l.target)
    return () => scene.remove(l.target)
  }, [scene])
  useFrame(() => {
    const l = light.current
    const p = localPlayer.position
    l.position.set(p.x + 45, p.y + 95, p.z + 30)
    l.target.position.set(p.x, p.y, p.z)
    l.target.updateMatrixWorld()
  })
  return (
    <>
      <hemisphereLight args={['#e6f3ff', '#b49ad8', 1.3]} />
      <directionalLight
        ref={light}
        castShadow
        color="#fff3dc"
        intensity={2.2}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.05}
        shadow-camera-left={-70}
        shadow-camera-right={70}
        shadow-camera-top={70}
        shadow-camera-bottom={-70}
        shadow-camera-near={1}
        shadow-camera-far={320}
      />
    </>
  )
}

/**
 * Fires `onFirstFrame` after the renderer has actually drawn once (the world is
 * built and on screen; AutoJoin joins a lobby after that).
 */
function FirstFrameSignal({ onFirstFrame }) {
  const fired = useRef(false)
  useFrame(() => {
    if (fired.current) return
    fired.current = true
    onFirstFrame()
  })
  return null
}

export function GameScene() {
  const { game } = useBloxity()
  const fontsReady = useFontsReady()
  const phase = useGameStore((s) => s.phase)
  const quality = useGameStore((s) => s.settings.quality)
  const firstFrame = useRef(false)
  // Render resolution: starts at the quality's maximum and steps down (or back
  // up) when the frame rate drops, so slower devices stay smooth.
  const maxDpr = Math.min(window.devicePixelRatio || 1, MAX_DPR[quality] ?? 1)
  const [dprScale, setDprScale] = useState(1)
  const dpr = Math.max(0.7, maxDpr * dprScale)

  useEffect(() => {
    installKeyboard()
    game.loadingStep('Building the world…')
    // Dev-only handle for automated screenshots and debugging from the console.
    if (import.meta.env.DEV) window.__game = { localPlayer, cameraRig, input, store: useGameStore, send, layout: getLayout(), sound }
  }, [game])

  const handleFirstFrame = () => {
    if (firstFrame.current) return
    firstFrame.current = true
    useGameStore.setState({ worldReady: true })
  }

  return (
    <Canvas
      shadows={quality !== 'low'}
      dpr={dpr}
      camera={{ position: [0, 36, 120], fov: 70, near: 0.3, far: 4500 }}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance' }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = NeutralToneMapping
        gl.toneMappingExposure = 1.05
        // Dev-only: lets screenshot scripts read draw calls (renderer.info).
        if (import.meta.env.DEV) {
          window.__gl = gl
          window.__scene = scene
        }
      }}
    >
      <PerformanceMonitor
        flipflops={4}
        onDecline={() => setDprScale((s) => Math.max(0.6, s - 0.15))}
        onIncline={() => setDprScale((s) => Math.min(1, s + 0.1))}
      />
      <Lights shadowSize={quality === 'high' ? 2048 : 1024} />
      <Sky />
      <Weather />
      <Particles />
      <FollowCamera />
      <SpeedBlur />
      {fontsReady && (
        <>
          <World />
          <LocalPlayer />
          {phase === 'playing' && <RemotePlayers />}
          <FirstFrameSignal onFirstFrame={handleFirstFrame} />
        </>
      )}
    </Canvas>
  )
}

export default GameScene
