'use client'

import { useEffect, useRef, useState } from 'react'
import { browserSupabase } from '@/lib/supabase-browser'

export function InvitationExperience({ token }: { token: string | null }) {
  const mount = useRef<HTMLDivElement>(null)
  const opening = useRef(false)
  const [opened, setOpened] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const host = mount.current
    if (!host) return
    let disposed = false
    let stop = () => {}

    void import('three').then(THREE => {
      if (disposed) return
      let renderer: InstanceType<typeof THREE.WebGLRenderer>
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
      } catch { return } // The letter and sign-in remain usable without WebGL.
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      host.appendChild(renderer.domElement)

      const scene = new THREE.Scene()
      const camera = new THREE.PerspectiveCamera(37, 1, 0.1, 80)
      camera.position.set(0, 0, 9.5)
      scene.add(new THREE.AmbientLight(0xb4c3dd, 1.25))
      const key = new THREE.PointLight(0xffdfaa, 32, 16)
      key.position.set(-2, 3, 5)
      scene.add(key)
      const rim = new THREE.PointLight(0x82a9c2, 19, 16)
      rim.position.set(3, -2, 2)
      scene.add(rim)

      const envelope = new THREE.Group()
      scene.add(envelope)
      const letterArtwork = document.createElement('canvas')
      letterArtwork.width = 1024
      letterArtwork.height = 672
      const ink = letterArtwork.getContext('2d')!
      ink.fillStyle = '#f8ead2'
      ink.fillRect(0, 0, 1024, 672)
      ink.strokeStyle = '#c4a879'
      ink.lineWidth = 3
      ink.strokeRect(56, 50, 912, 572)
      ink.textAlign = 'center'
      ink.fillStyle = '#6d5840'
      ink.font = 'bold 42px Georgia'
      ink.fillText('READLY', 512, 220)
      ink.font = '18px Georgia'
      ink.fillText('A LETTER FOR THE CURIOUS READER', 512, 272)
      ink.beginPath()
      ink.moveTo(390, 310)
      ink.lineTo(634, 310)
      ink.stroke()
      const letterTexture = new THREE.CanvasTexture(letterArtwork)
      letterTexture.colorSpace = THREE.SRGBColorSpace
      const paper = new THREE.Mesh(
        new THREE.PlaneGeometry(3.82, 2.52),
        new THREE.MeshStandardMaterial({ map: letterTexture, roughness: 0.88, side: THREE.DoubleSide }),
      )
      paper.position.set(0, -0.45, 0.08)
      envelope.add(paper)
      const paperEdge = new THREE.Mesh(
        new THREE.PlaneGeometry(3.55, 0.015), new THREE.MeshBasicMaterial({ color: 0xb79861 }),
      )
      paperEdge.position.set(0, 0.62, 0.1)
      paper.add(paperEdge)
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(4.45, 2.6, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x25354a, roughness: 0.7, metalness: 0.08 }),
      )
      body.position.set(0, -0.36, -0.08)
      envelope.add(body)
      const frontShape = new THREE.Shape()
      frontShape.moveTo(-2.22, -1.66)
      frontShape.lineTo(2.22, -1.66)
      frontShape.lineTo(2.22, 0.9)
      frontShape.lineTo(0, -0.43)
      frontShape.lineTo(-2.22, 0.9)
      frontShape.closePath()
      const front = new THREE.Mesh(new THREE.ShapeGeometry(frontShape),
        new THREE.MeshStandardMaterial({ color: 0x31465a, roughness: 0.74, side: THREE.DoubleSide }))
      front.position.z = 0.19
      envelope.add(front)
      const flap = new THREE.Group()
      flap.position.set(0, 0.93, 0.25)
      const flapShape = new THREE.Shape()
      flapShape.moveTo(-2.22, 0)
      flapShape.lineTo(2.22, 0)
      flapShape.lineTo(0, -1.42)
      flapShape.closePath()
      flap.add(new THREE.Mesh(new THREE.ShapeGeometry(flapShape),
        new THREE.MeshStandardMaterial({ color: 0x40586c, roughness: 0.65, side: THREE.DoubleSide })))
      envelope.add(flap)
      const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.04, 48),
        new THREE.MeshStandardMaterial({ color: 0xd3a97c, metalness: 0.65, roughness: 0.34 }))
      seal.rotation.x = Math.PI / 2
      seal.position.set(0, -0.1, 0.34)
      envelope.add(seal)
      const sealArtwork = document.createElement('canvas')
      sealArtwork.width = sealArtwork.height = 128
      const sealInk = sealArtwork.getContext('2d')!
      sealInk.fillStyle = '#503a31'
      sealInk.font = 'bold 82px Georgia'
      sealInk.textAlign = 'center'
      sealInk.textBaseline = 'middle'
      sealInk.fillText('R', 64, 67)
      const sealTexture = new THREE.CanvasTexture(sealArtwork)
      const sealMark = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42),
        new THREE.MeshBasicMaterial({ map: sealTexture, transparent: true, opacity: 0.75 }))
      sealMark.position.set(0, -0.1, 0.37)
      envelope.add(sealMark)

      const halo = new THREE.Mesh(new THREE.TorusGeometry(3.05, 0.008, 3, 180),
        new THREE.MeshBasicMaterial({ color: 0xb99068, transparent: true, opacity: 0.36 }))
      halo.rotation.x = -0.3
      halo.position.z = -1.5
      scene.add(halo)
      const dust = new Float32Array(210 * 3)
      for (let i = 0; i < 210; i++) {
        dust[i * 3] = (Math.random() - 0.5) * 16
        dust[i * 3 + 1] = (Math.random() - 0.5) * 10
        dust[i * 3 + 2] = -2 - Math.random() * 5
      }
      const particles = new THREE.BufferGeometry()
      particles.setAttribute('position', new THREE.BufferAttribute(dust, 3))
      scene.add(new THREE.Points(particles, new THREE.PointsMaterial({ color: 0xf1cf9a, size: 0.025, transparent: true, opacity: 0.55 })))

      const pointer = { x: 0, y: 0 }
      const onPointer = (event: PointerEvent) => {
        pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
        pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
      }
      window.addEventListener('pointermove', onPointer)
      const resize = () => {
        const width = host.clientWidth
        const height = host.clientHeight
        camera.aspect = width / Math.max(height, 1)
        camera.updateProjectionMatrix()
        renderer.setSize(width, height)
        const mobile = width < 760
        envelope.scale.setScalar(mobile ? 0.65 : 0.92)
        envelope.position.set(mobile ? 0 : 1.8, mobile ? 1.35 : 0, 0)
        halo.scale.setScalar(mobile ? 0.72 : 1)
        halo.position.x = envelope.position.x
        halo.position.y = envelope.position.y
      }
      const observer = new ResizeObserver(resize)
      observer.observe(host)
      resize()

      const startedAt = performance.now()
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      let progress = 0
      let frame = 0
      const animate = () => {
        frame = requestAnimationFrame(animate)
        const time = (performance.now() - startedAt) / 1000
        progress += (Number(opening.current) - progress) * (reducedMotion ? 1 : 0.055)
        flap.rotation.x = -Math.PI * 0.92 * Math.min(progress * 1.35, 1)
        paper.position.y = -0.45 + 1.58 * progress
        paper.position.z = 0.08 + 0.06 * progress
        seal.visible = progress < 0.2
        sealMark.visible = progress < 0.2
        envelope.rotation.y = pointer.x * 0.08 + Math.sin(time * 0.4) * 0.025
        envelope.rotation.x = -pointer.y * 0.045 + Math.sin(time * 0.6) * 0.018
        halo.rotation.z = time * 0.025
        renderer.render(scene, camera)
      }
      animate()
      stop = () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
        window.removeEventListener('pointermove', onPointer)
        scene.traverse(object => {
          if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
            object.geometry.dispose()
            const materials = Array.isArray(object.material) ? object.material : [object.material]
            materials.forEach(material => material.dispose())
          }
        })
        letterTexture.dispose()
        sealTexture.dispose()
        renderer.dispose()
        renderer.domElement.remove()
      }
    }).catch(() => {})
    return () => { disposed = true; stop() }
  }, [])

  async function signIn() {
    if (!token) return
    setLoading(true); setError('')
    try {
      const response = await fetch('/api/invitations/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }),
      })
      if (!response.ok) throw new Error('초대장이 만료되었거나 이미 사용되었습니다.')
      const { error: oauthError } = await browserSupabase().auth.signInWithOAuth({
        provider: 'google', options: { redirectTo: `${location.origin}/auth/invite-callback` },
      })
      if (oauthError) throw oauthError
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '로그인을 시작하지 못했습니다.')
      setLoading(false)
    }
  }

  return <main className={`invitation-page${opened ? ' is-open' : ''}`}>
    <div className="invitation-canvas" ref={mount} aria-hidden="true" />
    <div className="invitation-grain" aria-hidden="true" />
    <nav className="invitation-nav" aria-label="Readly 초대장"><a href="/" className="invitation-brand">Readly<span>.</span></a><span>PRIVATE INVITATION — 001</span></nav>
    <div className="invitation-story">
      <p className="invitation-kicker">A LETTER FOR YOU <span aria-hidden="true">✦</span></p>
      {token ? <>
        <h1>당신에게 도착한<br /><em>한 장의 초대장.</em></h1>
        {!opened ? <>
          <p className="invitation-copy">읽고 싶은 글을 더 가깝게 만나는 곳.<br />봉투를 열면, 당신의 새로운 읽기가 시작됩니다.</p>
          <button type="button" className="invitation-open" onClick={() => { opening.current = true; setOpened(true) }}>편지 열기 <span aria-hidden="true">↗</span></button>
        </> : <div className="invitation-message">
          <p className="invitation-salutation">Dear reader,</p>
          <p>긴 글을 만나기 전, 잠시 멈춰 핵심을 읽어보세요.<br />이동하는 길에는 그 이야기를 음성으로 들어도 좋고요.</p>
          <p>Readly에 당신을 초대합니다.</p>
          <button type="button" className="invitation-open" disabled={loading} onClick={() => void signIn()}>
            {loading ? 'Google로 이동하는 중…' : 'Google 계정으로 시작하기'} <span aria-hidden="true">↗</span>
          </button>
          <small>로그인이 완료되면 이 초대장은 닫힙니다.</small>
          {error && <p className="invitation-error" role="alert">{error}</p>}
        </div>}
      </> : <>
        <h1>이 편지는<br /><em>여기까지 왔어요.</em></h1>
        <p className="invitation-copy">이미 사용되었거나, 취소 또는 만료된 초대장입니다.<br />새 초대장을 받으려면 방장에게 연락해 주세요.</p>
        <a className="invitation-open" href="/login">로그인 화면으로 <span aria-hidden="true">↗</span></a>
      </>}
    </div>
    <div className="invitation-foot"><span>READ THE STORY BEFORE THE STORY</span><span>01 — 01</span></div>
  </main>
}
