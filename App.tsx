@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;700&display=swap');
@import "tailwindcss";

@theme {
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Space Grotesk", sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  
  --color-cobalt-50: #eff6ff;
  --color-cobalt-100: #dbeafe;
  --color-cobalt-200: #bfdbfe;
  --color-cobalt-300: #93c5fd;
  --color-cobalt-400: #60a5fa;
  --color-cobalt-500: #3b82f6;
  --color-cobalt-600: #1e40af;
  --color-cobalt-700: #1d4ed8;
  --color-cobalt-800: #1e40af;
  --color-cobalt-900: #1e3a8a;
  --color-cobalt-950: #172554;
  
  --color-gold-400: #fbbf24;
  --color-gold-500: #f59e0b;
  --color-gold-600: #d97706;
}

@layer base {
  body {
    @apply bg-[#0a0a0a] text-white font-sans antialiased;
    background-image: 
      radial-gradient(circle at 50% 0%, rgba(30, 40, 255, 0.05) 0%, transparent 50%),
      linear-gradient(rgba(255, 255, 255, 0.01) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.01) 1px, transparent 1px);
    background-size: 100% 100%, 80px 80px, 80px 80px;
    position: relative;
  }

  body::before {
    content: '';
    position: fixed;
    inset: 0;
    background-image: url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M10 10 L30 10 L30 30 M70 10 L90 10 L90 30 M10 70 L10 90 L30 90 M70 90 L90 90 L90 70 M50 20 L50 40 M50 60 L50 80 M20 50 L40 50 M60 50 L80 50' stroke='rgba(255,255,255,0.02)' stroke-width='0.5' fill='none'/%3E%3C/svg%3E");
    background-size: 200px 200px;
    pointer-events: none;
    z-index: -1;
  }
}

@utility glass {
  @apply bg-white/[0.03] backdrop-blur-2xl border border-white/10 shadow-2xl;
}

@utility brushed-metal {
  background: linear-gradient(145deg, #1a1a1a, #0d0d0d);
  border: 1px solid rgba(255, 255, 255, 0.05);
  box-shadow: inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 10px 20px rgba(0, 0, 0, 0.4);
}

@utility led-cyan {
  text-shadow: 0 0 10px rgba(34, 211, 238, 0.5), 0 0 20px rgba(34, 211, 238, 0.2);
}

@utility led-purple {
  text-shadow: 0 0 10px rgba(168, 85, 247, 0.5), 0 0 20px rgba(168, 85, 247, 0.2);
}

@utility cockpit-card {
  @apply relative overflow-hidden transition-all duration-500;
  transform: perspective(1000px) rotateX(2deg);

  &:hover {
    transform: perspective(1000px) rotateX(0deg) translateY(-5px);
  }
}

@utility crystal-save {
  background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
  border: 1px solid rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 20px rgba(59, 130, 246, 0.5), inset 0 0 10px rgba(255, 255, 255, 0.3);
  @apply text-white hover:brightness-110 transition-all active:scale-95;
}

@utility matrix-console {
  background: black !important;
  @apply font-mono;
  color: #00ff41 !important; /* Matrix Green */
  text-shadow: 0 0 5px rgba(0, 255, 65, 0.5);
}

@utility generator-panel {
  @apply bg-white/[0.03] backdrop-blur-2xl border border-white/10 shadow-2xl rounded-[3rem] border border-cyan-500/20 shadow-[0_0_40px_rgba(34,211,238,0.05)];
}

@utility generator-action-btn {
  background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%);
  box-shadow: 0 0 30px rgba(139, 92, 246, 0.4);
  @apply text-white hover:brightness-110 active:scale-[0.98] transition-all;
}

@utility amber-glow {
  text-shadow: 0 0 10px rgba(245, 158, 11, 0.6);
  color: #fbbf24 !important;
}

@utility frosted-input-green {
  @apply placeholder:text-[#10b981]/50;
}

@utility textarea-midnight {
  background: #080808 !important;
  @apply border-white/5 focus:border-cyan-400 transition-all;
}

@utility frosted-input {
  @apply bg-white/[0.03] backdrop-blur-md border border-white/10 rounded-xl px-4 py-2 text-xs transition-all focus:outline-none focus:border-cyan-400 focus:bg-white/[0.05];
}

@utility pulse-glow-green {
  box-shadow: 0 0 15px rgba(16, 185, 129, 0.4);
  animation: pulse-green 2s infinite;
}

@utility recessed-editor {
  background: #050505;
  box-shadow: inset 0 4px 12px rgba(0, 0, 0, 0.8), 0 1px 0 rgba(255, 255, 255, 0.05);
}

@utility neon-amber-alert {
  @apply border-amber-500/50 bg-amber-500/[0.03];
  box-shadow: 0 0 15px rgba(245, 158, 11, 0.1);
}

@utility bullet-glow-blue {
  @apply w-2 h-2 rounded-full bg-cyan-400 inline-block shrink-0;
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.8);
}

@utility animate-blink {
  animation: blink 1s step-end infinite;
}

@utility custom-scrollbar-cyan {
  scrollbar-width: thin;
  scrollbar-color: #22d3ee rgba(255, 255, 255, 0.02);
}

@utility hexagon-pattern {
  background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M30 0l25.98 15v30L30 60 4.02 45V15z' fill-opacity='0.05' fill='%23ffffff' fill-rule='evenodd'/%3E%3C/svg%3E");
  background-size: 120px 120px;
}

@utility cyber-card {
  @apply relative overflow-hidden transition-all duration-500;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);

  &:hover {
    transform: translateY(-5px);
    border-color: var(--card-glow);
    box-shadow: 0 0 30px var(--card-glow-soft);

    &::before {
      left: 100%;
    }
  }

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.05), transparent);
    transition: 0.5s;
  }
}

@utility neon-border-animate {
  position: relative;

  &::after {
    content: '';
    position: absolute;
    inset: -1px;
    background: linear-gradient(45deg, #a855f7, #06b6d4, #a855f7);
    background-size: 200% 200%;
    animation: neon-flow 3s linear infinite;
    z-index: -1;
    border-radius: inherit;
    opacity: 0.5;
  }
}

@utility glow-primary {
  box-shadow: 0 0 20px rgba(99, 102, 241, 0.2);
}

@utility code-editor {
  background: #0d0d0d;
}

@utility gold-neon-btn {
  background: linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%);
  box-shadow: 0 0 20px rgba(245, 158, 11, 0.4), inset 0 0 8px rgba(255, 255, 255, 0.4);
  @apply text-black font-black uppercase tracking-tighter hover:brightness-110 active:scale-95 transition-all;
}

@utility red-alert-btn {
  background: #080808;
  border: 1px solid rgba(239, 68, 68, 0.3);
  box-shadow: 0 0 15px rgba(239, 68, 68, 0.1), inset 0 0 5px rgba(239, 68, 68, 0.2);
  @apply text-red-500 hover:bg-red-500/10 hover:border-red-500 transition-all active:scale-95 px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2;
}

@utility violet-blue-glow-btn {
  background: linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%);
  box-shadow: 0 0 20px rgba(139, 92, 246, 0.3);
  @apply text-white font-black hover:brightness-110 transition-all active:scale-95;
}

@utility circuit-grid {
  background-image: 
    linear-gradient(rgba(34, 211, 238, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(34, 211, 238, 0.05) 1px, transparent 1px);
  background-size: 30px 30px;
}

@utility scanline {
  position: relative;
  overflow: hidden;
  &::before {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, transparent, rgba(34, 211, 238, 0.03) 50%, transparent);
    background-size: 100% 4px;
    animation: scan 10s linear infinite;
    pointer-events: none;
  }
}

@keyframes scan {
  from { transform: translateY(-100%); }
  to { transform: translateY(100%); }
}

@keyframes pulse-green {
  0% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.4); }
  50% { box-shadow: 0 0 20px rgba(16, 185, 129, 0.8); }
  100% { box-shadow: 0 0 5px rgba(16, 185, 129, 0.4); }
}

@keyframes blink {
  50% { opacity: 0; }
}

@keyframes neon-flow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}

@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
  100% { transform: translateY(0px); }
}

