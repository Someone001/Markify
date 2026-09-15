'use client'

import { useEffect, useRef } from 'react'

export default function BackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.85
      videoRef.current.play().catch(() => {
        // Autoplay may be restricted until first interaction on some browsers
      })
    }
  }, [])

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden select-none"
    >
      <video
        ref={videoRef}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        className="w-full h-full object-cover opacity-25 filter brightness-75 contrast-125 transition-opacity duration-1000"
        style={{
          transform: 'translate3d(0, 0, 0)',
          willChange: 'transform',
        }}
      >
        <source src="/bg-video.mp4" type="video/mp4" />
      </video>

      {/* Atmospheric dark gradient mesh overlay for readability & contrast */}
      <div className="absolute inset-0 bg-background/85 backdrop-blur-[0.5px]" />
      <div className="absolute inset-0 bg-radial-vignette opacity-70" />
    </div>
  )
}
