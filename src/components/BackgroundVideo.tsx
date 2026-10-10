'use client'


export default function BackgroundVideo() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-[-1] overflow-hidden select-none bg-[#090b10]"
    >
      {/* High-performance hardware-accelerated ambient glow (0% GPU/CPU idle overhead) */}
      <div 
        className="absolute inset-0 opacity-40 pointer-events-none"
        style={{
          backgroundImage: `
            radial-gradient(at 0% 0%, rgba(195, 244, 0, 0.08) 0px, transparent 50%),
            radial-gradient(at 100% 0%, rgba(0, 238, 252, 0.08) 0px, transparent 50%),
            radial-gradient(at 50% 100%, rgba(195, 244, 0, 0.05) 0px, transparent 60%)
          `,
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,#090b10_90%)]" />
    </div>
  )
}
