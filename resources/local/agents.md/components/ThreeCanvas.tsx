"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry.js";

export default function ThreeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const animationIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 30;

    // Renderer
    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Particles
    const particlesGeometry = new THREE.BufferGeometry();
    const particlesCount = 3000;
    const positions = new Float32Array(particlesCount * 3);
    const colors = new Float32Array(particlesCount * 3);

    const colorBlue = new THREE.Color(0x0007cd);
    const colorCyan = new THREE.Color(0x00d4ff);
    const colorWhite = new THREE.Color(0xffffff);

    for (let i = 0; i < particlesCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 100;
      positions[i3 + 1] = (Math.random() - 0.5) * 100;
      positions[i3 + 2] = (Math.random() - 0.5) * 100;

      const mixColor =
        Math.random() > 0.5 ? colorBlue : Math.random() > 0.5 ? colorCyan : colorWhite;
      colors[i3] = mixColor.r;
      colors[i3 + 1] = mixColor.g;
      colors[i3 + 2] = mixColor.b;
    }

    particlesGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(positions, 3)
    );
    particlesGeometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const particlesMaterial = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
    });

    const particlesMesh = new THREE.Points(
      particlesGeometry,
      particlesMaterial
    );
    scene.add(particlesMesh);

    // Floating geometric shapes
    const shapes: THREE.Mesh[] = [];
    const geometries = [
      new THREE.IcosahedronGeometry(1, 0),
      new THREE.OctahedronGeometry(1, 0),
      new THREE.TetrahedronGeometry(1, 0),
    ];

    const material = new THREE.MeshBasicMaterial({
      color: 0x0007cd,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
    });

    for (let i = 0; i < 15; i++) {
      const geometry =
        geometries[Math.floor(Math.random() * geometries.length)];
      const mesh = new THREE.Mesh(geometry, material.clone());
      mesh.position.set(
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 60,
        (Math.random() - 0.5) * 40
      );
      mesh.rotation.set(
        Math.random() * Math.PI,
        Math.random() * Math.PI,
        Math.random() * Math.PI
      );
      mesh.userData = {
        rotationSpeed: {
          x: (Math.random() - 0.5) * 0.01,
          y: (Math.random() - 0.5) * 0.01,
          z: (Math.random() - 0.5) * 0.01,
        },
        floatSpeed: Math.random() * 0.5 + 0.5,
        floatOffset: Math.random() * Math.PI * 2,
      };
      shapes.push(mesh);
      scene.add(mesh);
    }

    // Text "Antony Nguyễn" - loaded asynchronously
    let textMesh: THREE.Mesh | null = null;
    let textLoaded = false;

    const loadFont = () => {
      const loader = new FontLoader();
      loader.load(
        "https://threejs.org/examples/fonts/helvetiker_bold.typeface.json",
        (font) => {
          const textGeometry = new TextGeometry("Antony Nguyễn", {
            font: font,
            size: 3,
            height: 0.5,
            curveSegments: 12,
            bevelEnabled: true,
            bevelThickness: 0.03,
            bevelSize: 0.02,
            bevelSegments: 5,
          });

          textGeometry.computeBoundingBox();
          const centerOffset = new THREE.Vector3();
          textGeometry.boundingBox?.getCenter(centerOffset);
          textGeometry.translate(-centerOffset.x, -centerOffset.y, -centerOffset.z);

          const textMaterial = new THREE.MeshPhongMaterial({
            color: 0xffffff,
            specular: 0x0007cd,
            shininess: 100,
            transparent: true,
            opacity: 0.9,
          });

          textMesh = new THREE.Mesh(textGeometry, textMaterial);
          textMesh.position.set(0, 8, 0);
          scene.add(textMesh);
          textLoaded = true;
        },
        undefined,
        (error) => {
          console.log("Font loading failed, using fallback text");
          textLoaded = true;
        }
      );
    };

    loadFont();

    // Mouse interaction
    const mouse = { x: 0, y: 0 };
    const handleMouseMove = (event: MouseEvent) => {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Resize handler
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", handleResize);

    // Animation
    let time = 0;
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate);
      time += 0.01;

      // Rotate particles
      particlesMesh.rotation.y += 0.0005;
      particlesMesh.rotation.x += 0.0002;

      // Animate shapes
      shapes.forEach((shape) => {
        shape.rotation.x += shape.userData.rotationSpeed.x;
        shape.rotation.y += shape.userData.rotationSpeed.y;
        shape.rotation.z += shape.userData.rotationSpeed.z;

        const floatY = Math.sin(time * shape.userData.floatSpeed + shape.userData.floatOffset) * 0.5;
        shape.position.y += floatY * 0.01;
      });

      // Camera follows mouse slightly
      camera.position.x += (mouse.x * 5 - camera.position.x) * 0.02;
      camera.position.y += (mouse.y * 5 - camera.position.y) * 0.02;
      camera.lookAt(scene.position);

      // Text rotation
      if (textMesh) {
        textMesh.rotation.y = Math.sin(time * 0.5) * 0.3;
        textMesh.position.y = 8 + Math.sin(time) * 0.5;
      }

      renderer.render(scene, camera);
    };

    animate();

    // Cleanup
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      renderer.dispose();
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={containerRef} className="three-canvas" />;
}