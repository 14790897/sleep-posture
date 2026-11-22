"use client";

import { useEffect, useRef, type MutableRefObject } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { PoseEngine } from "@/lib/pose-engine";

export type SceneApi = {
  resetView: () => void;
};

type BoardSceneProps = {
  engine: PoseEngine;
  sceneApiRef: MutableRefObject<SceneApi | null>;
  onLoaded?: () => void;
  onError?: (message: string) => void;
};

export function BoardScene({
  engine,
  sceneApiRef,
  onLoaded,
  onError,
}: BoardSceneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const resetViewRef = useRef<() => void>(() => {});
    const callbacksRef = useRef({ onLoaded, onError });
    callbacksRef.current = { onLoaded, onError };

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      let disposed = false;
      let raf = 0;
      const width = Math.max(container.clientWidth, 1);
      const height = Math.max(container.clientHeight, 1);

      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.0;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.display = "block";
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.setAttribute(
        "aria-label",
        "SleepPosture 板子实时 3D 模型",
      );
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x000000);
      scene.fog = new THREE.FogExp2(0x000000, 0.0028);

      const camera = new THREE.PerspectiveCamera(
        35,
        width / height,
        0.1,
        2000,
      );
      camera.up.set(0, 0, 1);
      camera.position.set(0, -130, 85);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.set(0, 0, 0);
      controls.enableDamping = true;
      controls.dampingFactor = 0.065;
      controls.minDistance = 30;
      controls.maxDistance = 420;
      controls.minPolarAngle = 0.12;
      controls.maxPolarAngle = Math.PI * 0.49;

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envScene = new RoomEnvironment();
      scene.environment = pmrem.fromScene(envScene, 0.04).texture;

      scene.add(new THREE.HemisphereLight(0xffffff, 0x0a0a0a, 1.0));

      const keyLight = new THREE.DirectionalLight(0xffffff, 2.1);
      keyLight.position.set(65, 85, 130);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.left = -75;
      keyLight.shadow.camera.right = 75;
      keyLight.shadow.camera.top = 75;
      keyLight.shadow.camera.bottom = -75;
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 320;
      keyLight.shadow.bias = -0.0005;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(0x0070f3, 0.55);
      rimLight.position.set(-95, -70, 55);
      scene.add(rimLight);

      const fillLight = new THREE.DirectionalLight(0x9a9a9a, 0.35);
      fillLight.position.set(-40, 90, 20);
      scene.add(fillLight);

      const grid = new THREE.GridHelper(260, 26, 0x1f1f1f, 0x111111);
      grid.rotation.x = Math.PI / 2;
      grid.position.z = -10;
      grid.material.transparent = true;
      grid.material.opacity = 0.42;
      scene.add(grid);

      const platform = new THREE.Mesh(
        new THREE.CircleGeometry(92, 72),
        new THREE.MeshStandardMaterial({
          color: 0x050505,
          metalness: 0.1,
          roughness: 0.9,
          transparent: true,
          opacity: 0.68,
        }),
      );
      platform.position.z = -10.4;
      platform.receiveShadow = true;
      scene.add(platform);

      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(300, 300),
        new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.28 }),
      );
      shadowPlane.position.z = -10.1;
      shadowPlane.receiveShadow = true;
      scene.add(shadowPlane);

      const boardGroup = new THREE.Group();
      scene.add(boardGroup);
      let maxDim = 50;

      const applyView = () => {
        controls.target.set(0, 0, 0);
        camera.position.set(0, -maxDim * 2.35, maxDim * 1.45);
        camera.near = Math.max(0.1, maxDim * 0.01);
        camera.far = maxDim * 40;
        camera.updateProjectionMatrix();
        controls.minDistance = maxDim * 0.5;
        controls.maxDistance = maxDim * 8;
        controls.update();
      };
      resetViewRef.current = applyView;
      sceneApiRef.current = { resetView: applyView };

      const loader = new GLTFLoader();
      loader.load(
        "/board_merged.glb",
        (gltf) => {
          if (disposed) return;
          const model = gltf.scene;
          model.scale.setScalar(1000);
          const rawBox = new THREE.Box3().setFromObject(model);
          const center = rawBox.getCenter(new THREE.Vector3());
          model.position.sub(center);
          model.traverse((object) => {
            if (!(object instanceof THREE.Mesh)) return;
            object.castShadow = true;
            object.receiveShadow = true;
            const materials = Array.isArray(object.material)
              ? object.material
              : [object.material];
            for (const material of materials) {
              if (!material) continue;
              if ("metalness" in material) {
                material.metalness = Math.min(
                  (material.metalness as number) ?? 0.2,
                  0.35,
                );
              }
              if ("roughness" in material) {
                material.roughness = Math.max(
                  (material.roughness as number) ?? 0.45,
                  0.38,
                );
              }
              if ("envMapIntensity" in material) {
                material.envMapIntensity = 0.9;
              }
              material.needsUpdate = true;
            }
          });
          boardGroup.add(model);
          const box = new THREE.Box3().setFromObject(boardGroup);
          const size = box.getSize(new THREE.Vector3());
          maxDim = Math.max(size.x, size.y, size.z, 20);
          applyView();
          callbacksRef.current.onLoaded?.();
        },
        undefined,
        (error) => {
          if (disposed) return;
          console.error("board_merged.glb failed to load", error);
          callbacksRef.current.onError?.("3D 模型加载失败");
        },
      );

      const clock = new THREE.Clock();
      const animate = () => {
        raf = window.requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);
        const rotation = engine.update(performance.now(), dt);
        boardGroup.quaternion.copy(rotation);
        controls.update();
        renderer.render(scene, camera);
      };
      animate();

      const resize = () => {
        const nextWidth = container.clientWidth;
        const nextHeight = container.clientHeight;
        if (!nextWidth || !nextHeight) return;
        camera.aspect = nextWidth / nextHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(nextWidth, nextHeight, false);
      };
      const observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();

      return () => {
        disposed = true;
        sceneApiRef.current = null;
        window.cancelAnimationFrame(raf);
        observer.disconnect();
        controls.dispose();
        scene.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            for (const value of Object.values(material)) {
              if (value instanceof THREE.Texture) value.dispose();
            }
            material.dispose();
          }
        });
        pmrem.dispose();
        envScene.dispose?.();
        renderer.dispose();
        if (renderer.domElement.parentElement === container) {
          container.removeChild(renderer.domElement);
        }
      };
    }, [engine]);

    return <div ref={containerRef} className="absolute inset-0" />;
  }
