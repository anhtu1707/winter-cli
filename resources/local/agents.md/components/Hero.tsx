"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const ThreeCanvas = dynamic(() => import("./ThreeCanvas"), { ssr: false });

export default function Hero() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Three.js Background */}
      <div className="three-canvas">
        <ThreeCanvas />
      </div>

      {/* Spotlight Glow Effects */}
      <div
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          width: "800px",
          height: "800px",
          background:
            "radial-gradient(circle, rgba(26, 38, 255, 0.3) 0%, transparent 70%)",
          filter: "blur(100px)",
          animation: "pulse-glow 4s ease-in-out infinite",
        }}
      />
      <div
        className="absolute bottom-1/4 right-1/4"
        style={{
          width: "400px",
          height: "400px",
          background:
            "radial-gradient(circle, rgba(0, 212, 255, 0.2) 0%, transparent 70%)",
          filter: "blur(80px)",
          animation: "pulse-glow 5s ease-in-out infinite 1s",
        }}
      />

      {/* Main Content */}
      <div className="relative z-10 text-center px-6 max-w-5xl mx-auto">
        {/* Badge */}
        <div
          className={`inline-flex items-center gap-2 mb-8 ${
            isVisible ? "fade-in-up" : "opacity-0"
          }`}
        >
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="badge-pill">Available for opportunities</span>
        </div>

        {/* Name with 3D Effect */}
        <h1
          className={`text-6xl md:text-8xl font-bold mb-6 tracking-tight ${
            isVisible ? "fade-in-up stagger-1" : "opacity-0"
          }`}
          style={{
            background: "linear-gradient(135deg, #ffffff 0%, #a8a8a8 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textShadow: "0 0 60px rgba(26, 38, 255, 0.5)",
          }}
        >
          Antony Nguyễn
        </h1>

        {/* Title */}
        <p
          className={`text-xl md:text-2xl text-[var(--color-body)] mb-4 ${
            isVisible ? "fade-in-up stagger-2" : "opacity-0"
          }`}
        >
          <span className="text-white">Staff Software Engineer</span>
          <span className="mx-3 text-[var(--color-muted)]">•</span>
          <span>8+ Years Experience</span>
        </p>

        {/* Tagline */}
        <p
          className={`text-lg text-[var(--color-muted)] mb-12 max-w-2xl mx-auto ${
            isVisible ? "fade-in-up stagger-3" : "opacity-0"
          }`}
        >
          Building scalable systems and leading high-performance teams.
          Passionate about clean architecture and developer experience.
        </p>

        {/* Terminal Mockup */}
        <div
          className={`terminal-window max-w-3xl mx-auto mb-12 ${
            isVisible ? "fade-in-up stagger-4" : "opacity-0"
          }`}
        >
          <div className="terminal-header">
            <div className="terminal-dot bg-red-500" />
            <div className="terminal-dot bg-yellow-500" />
            <div className="terminal-dot bg-green-500" />
            <span className="ml-4 text-xs text-[var(--color-muted)] font-mono">
              antony@portfolio ~ bash
            </span>
          </div>
          <div className="terminal-content text-left">
            <p>
              <span className="code-comment"># Welcome to my digital space</span>
            </p>
            <p className="mt-2">
              <span className="text-[var(--color-accent-cyan)]">❯</span>{" "}
              <span className="code-function">whoami</span>
            </p>
            <p className="text-white">antony-nguyen</p>
            <p className="mt-2">
              <span className="text-[var(--color-accent-cyan)]">❯</span>{" "}
              <span className="code-function">cat</span>{" "}
              <span className="code-string">skills.json</span>
            </p>
            <p>
              <span className="code-variable">&quot;expertise&quot;</span>:{" "}
              <span className="code-string">
                [&quot;System Design&quot;, &quot;TypeScript&quot;, &quot;React&quot;,
                &quot;Node.js&quot;, &quot;AWS&quot;, &quot;Leadership&quot;]
              </span>
            </p>
            <p className="mt-2">
              <span className="text-[var(--color-accent-cyan)]">❯</span>{" "}
              <span className="code-function">cat</span>{" "}
              <span className="code-string">achievements.md</span>
            </p>
            <p>
              <span className="text-[var(--color-success)]">✓</span> Built
              systems serving{" "}
              <span className="code-number">10M+</span> users
            </p>
            <p>
              <span className="text-[var(--color-success)]">✓</span> Led teams
              of{" "}
              <span className="code-number">15+</span> engineers
            </p>
            <p>
              <span className="text-[var(--color-success)]">✓</span> Open source
              contributor with{" "}
              <span className="code-number">2.5k+</span> stars
            </p>
            <p className="mt-2">
              <span className="text-[var(--color-accent-cyan)]">❯</span>{" "}
              <span className="animate-pulse">_</span>
            </p>
          </div>
        </div>

        {/* CTA Buttons */}
        <div
          className={`flex flex-wrap justify-center gap-4 ${
            isVisible ? "fade-in-up stagger-5" : "opacity-0"
          }`}
        >
          <a href="#projects" className="btn-primary">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 14l-7 7m0 0l-7-7m7 7V3"
              />
            </svg>
            View Projects
          </a>
          <a href="#contact" className="btn-secondary">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
            Get in Touch
          </a>
          <a
            href="https://github.com/antony-nguyen"
            target="_blank"
            rel="noopener noreferrer"
            className="btn-outline"
          >
            <svg
              className="w-5 h-5"
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            GitHub
          </a>
        </div>

        {/* Scroll Indicator */}
        <div
          className={`absolute bottom-8 left-1/2 -translate-x-1/2 ${
            isVisible ? "fade-in-up stagger-6" : "opacity-0"
          }`}
        >
          <div className="flex flex-col items-center gap-2 text-[var(--color-muted)]">
            <span className="text-xs uppercase tracking-widest">Scroll</span>
            <div className="w-6 h-10 border-2 border-[var(--color-muted)] rounded-full flex justify-center pt-2">
              <div
                className="w-1.5 h-3 bg-[var(--color-primary)] rounded-full animate-bounce"
                style={{ animationDuration: "1.5s" }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
