import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InteractionManager } from 'three.interactive';
import { gsap } from 'gsap';

// Set up variables
var meshLoaded = false;
const clock = new THREE.Clock();

// Pallet turner spin state
let palletTurnerSpinState = {
    object: null,
    angularVelocity: 0, // radians per second
    deceleration: 5 // deceleration factor (radians per second squared)
};

// Set up Renderer
// Disable antialias on mobile to reduce GPU pressure and memory allocation
const isMobile = /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                 (navigator.maxTouchPoints && navigator.maxTouchPoints > 2) ||
                 /^((?!chrome|android).)*safari/i.test(navigator.userAgent) && screen.width <= 1366;
console.log('[Device Detection] isMobile:', isMobile, 'userAgent:', navigator.userAgent);
const renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xfaf7f3);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.body.appendChild(renderer.domElement);

// Advanced performance monitoring
class PerformanceMonitor {
    constructor() {
        this.frameTimes = [];
        this.maxSamples = 300;
        this.lastFrameTime = performance.now();
        this.gcPauses = [];
        this.touchEvents = 0;
        this.sampleRate = 3; // Only record every 3rd frame to reduce memory churn
        this.frameCounter = 0;
    }
    
    recordFrame() {
        const now = performance.now();
        const deltaMs = now - this.lastFrameTime;
        
        // Only sample every Nth frame to reduce GC pressure
        this.frameCounter++;
        if (this.frameCounter % this.sampleRate === 0) {
            this.frameTimes.push(deltaMs);
            if (this.frameTimes.length > this.maxSamples) {
                this.frameTimes.shift();
            }
        }
        
        this.lastFrameTime = now;
        
        // Detect GC pauses (frames > 25ms are suspect)
        if (deltaMs > 25) {
            this.gcPauses.push({ time: now, duration: deltaMs });
            if (this.gcPauses.length > 50) this.gcPauses.shift();
        }
    }
    
    getStats() {
        if (this.frameTimes.length === 0) return null;
        const times = [...this.frameTimes].sort((a, b) => a - b);
        const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
        const max = Math.max(...this.frameTimes);
        const min = Math.min(...this.frameTimes);
        const p95 = times[Math.floor(times.length * 0.95)];
        const fps = Math.round(1000 / avg);
        return { avg, max, min, p95, fps, samples: this.frameTimes.length };
    }
    
    recordTouch() {
        this.touchEvents++;
    }
    
    export() {
        return {
            stats: this.getStats(),
            frameTimes: this.frameTimes.slice(),
            gcPauses: this.gcPauses.slice(),
            memory: performance.memory ? {
                usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
                totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
                jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB'
            } : null,
            touchEvents: this.touchEvents,
            sampleRate: this.sampleRate
        };
    }
}

const perfMonitor = new PerformanceMonitor();

// Lightweight FPS + frametime display (disabled on mobile to reduce allocations)
let showPerfMonitor = !isMobile;
console.log('[Perf Monitor] showPerfMonitor:', showPerfMonitor);
const fpsDisplay = document.createElement('div');
fpsDisplay.style.position = 'fixed';
fpsDisplay.style.top = '10px';
fpsDisplay.style.left = '10px';
fpsDisplay.style.padding = '8px 12px';
fpsDisplay.style.background = 'rgba(0,0,0,0.7)';
fpsDisplay.style.color = '#f5f5f5';
fpsDisplay.style.fontFamily = 'monospace';
fpsDisplay.style.fontSize = '11px';
fpsDisplay.style.zIndex = '10';
fpsDisplay.style.lineHeight = '1.4';
fpsDisplay.style.whiteSpace = 'pre';
fpsDisplay.style.display = showPerfMonitor ? 'block' : 'none';
fpsDisplay.textContent = 'FPS: --\nAvg: -- ms\nMax: -- ms\nP95: -- ms';
document.body.appendChild(fpsDisplay);

// Toggle button for perf monitor
const togglePerfBtn = document.createElement('button');
togglePerfBtn.textContent = 'Toggle Perf Monitor';
togglePerfBtn.style.position = 'fixed';
togglePerfBtn.style.top = '10px';
togglePerfBtn.style.right = '10px';
togglePerfBtn.style.padding = '8px 12px';
togglePerfBtn.style.background = '#333';
togglePerfBtn.style.color = '#fff';
togglePerfBtn.style.border = '1px solid #666';
togglePerfBtn.style.borderRadius = '4px';
togglePerfBtn.style.cursor = 'pointer';
togglePerfBtn.style.fontSize = '12px';
togglePerfBtn.style.zIndex = '10';
togglePerfBtn.onclick = () => {
    showPerfMonitor = !showPerfMonitor;
    fpsDisplay.style.display = showPerfMonitor ? 'block' : 'none';
    console.log('[Perf Monitor] Toggled to:', showPerfMonitor);
};
document.body.appendChild(togglePerfBtn);

// Export button for performance data
const exportBtn = document.createElement('button');
exportBtn.textContent = 'Export Perf Data';
exportBtn.style.position = 'fixed';
exportBtn.style.bottom = '10px';
exportBtn.style.left = '10px';
exportBtn.style.padding = '8px 12px';
exportBtn.style.background = '#333';
exportBtn.style.color = '#fff';
exportBtn.style.border = '1px solid #666';
exportBtn.style.borderRadius = '4px';
exportBtn.style.cursor = 'pointer';
exportBtn.style.fontSize = '12px';
exportBtn.style.zIndex = '10';
exportBtn.onclick = () => {
    const data = perfMonitor.export();
    console.log('Performance Data:', data);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `perf_${new Date().toISOString().slice(0,19).replace(/:/g,'-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
};
document.body.appendChild(exportBtn);

// Create return button for hotspots
const hotspotReturnBtn = document.createElement('button');
hotspotReturnBtn.textContent = 'Return';
hotspotReturnBtn.style.position = 'fixed';
hotspotReturnBtn.style.bottom = '20px';
hotspotReturnBtn.style.right = '20px';
hotspotReturnBtn.style.padding = '12px 20px';
hotspotReturnBtn.style.background = '#333';
hotspotReturnBtn.style.color = '#fff';
hotspotReturnBtn.style.border = '1px solid #666';
hotspotReturnBtn.style.borderRadius = '4px';
hotspotReturnBtn.style.cursor = 'pointer';
hotspotReturnBtn.style.fontSize = '14px';
hotspotReturnBtn.style.zIndex = '10';
hotspotReturnBtn.style.display = 'none'; // Hidden by default
hotspotReturnBtn.onclick = () => {
    if (hotspotManager) {
        hotspotManager.returnToLastPosition();
    }
};
document.body.appendChild(hotspotReturnBtn);

let updateCounter = 0;
function updateMetrics() {
    if (!showPerfMonitor) return; // Skip on mobile
    updateCounter++;
    if (updateCounter % 10 === 0) { // Update display every 10 frames
        const stats = perfMonitor.getStats();
        if (stats) {
            fpsDisplay.textContent = `FPS: ${stats.fps}\nAvg: ${stats.avg.toFixed(1)} ms\nMax: ${stats.max.toFixed(1)} ms\nP95: ${stats.p95.toFixed(1)} ms`;
        }
    }
}

// Set up Scene
const scene = new THREE.Scene();
const environmentTexture = new THREE.CubeTextureLoader().setPath('./env/').load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);
scene.environment = environmentTexture;
scene.environmentIntensity = 1.5;

// Add white fog
const fogColor = 0xffffff;
scene.fog = new THREE.Fog(fogColor, 80, 200); // (color, near, far)
scene.background = new THREE.Color(fogColor);

// Add camera
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(35, 15, 35);

const interactionManager = new InteractionManager(renderer, camera, renderer.domElement);

// Hotspot system
class HotspotManager {
    constructor(camera, scene) {
        this.camera = camera;
        this.controls = null; // Will be set after controls are created
        this.scene = scene;
        this.hotspots = new Map();
        this.isAnimating = false;
        this.hotspotsEnabled = true; // Disable hotspots while animating
        this.lastCameraPos = new THREE.Vector3();
        this.lastCameraTarget = new THREE.Vector3();
        this.currentHotspotId = null;
        this.skipControlsUpdate = false; // Flag to prevent controls from interfering during animation
        
        // Listen for R key to return
        window.addEventListener('keydown', (e) => this.handleKeyPress(e));
    }
    
    setControls(controls) {
        this.controls = controls;
    }
    
    registerHotspot(id, clickGeometry, targetObj, camPos1) {
        this.hotspots.set(id, { clickGeometry, targetObj, camPos1 });
        
        // Disable shadows on click geometry (invisible interaction meshes)
        clickGeometry.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
                console.log(`[Hotspots] Disabled shadows on ${id} mesh: ${child.name || 'unnamed'}`);
            }
        });
        
        // Debug information about the click geometry
        console.log(`[Hotspots] Registering ${id}:`, {
            isObject3D: clickGeometry instanceof THREE.Object3D,
            type: clickGeometry.type,
            position: clickGeometry.position,
            visible: clickGeometry.visible,
            hasGeometry: clickGeometry.geometry ? true : false,
            hasMaterial: clickGeometry.material ? true : false,
            children: clickGeometry.children.length
        });
        
        // Add click geometry (and all its children if it's a group) to interaction manager
        // If it's a mesh with geometry, add it directly
        if (clickGeometry.geometry) {
            interactionManager.add(clickGeometry);
            clickGeometry.addEventListener('click', () => {
                if (!this.hotspotsEnabled) {
                    console.log(`[Hotspots] Click ignored on ${id} - hotspots disabled`);
                    return;
                }
                console.log(`[Hotspots] Click detected on ${id}`);
                this.activateHotspot(id);
            });
            clickGeometry.addEventListener('mouseover', () => {
                renderer.domElement.style.cursor = 'pointer';
            });
            clickGeometry.addEventListener('mouseout', () => {
                renderer.domElement.style.cursor = 'default';
            });
        } else {
            // If it's a group/empty object, try to add all mesh children
            clickGeometry.traverse((child) => {
                if (child.isMesh && child.geometry) {
                    interactionManager.add(child);
                    child.addEventListener('click', () => {
                        if (!this.hotspotsEnabled) {
                            console.log(`[Hotspots] Click ignored on ${id} (via child mesh) - hotspots disabled`);
                            return;
                        }
                        console.log(`[Hotspots] Click detected on ${id} (via child mesh)`);
                        this.activateHotspot(id);
                    });
                    child.addEventListener('mouseover', () => {
                        renderer.domElement.style.cursor = 'pointer';
                    });
                    child.addEventListener('mouseout', () => {
                        renderer.domElement.style.cursor = 'default';
                    });
                }
            });
            
            // Also add the parent group itself to catch clicks
            interactionManager.add(clickGeometry);
            clickGeometry.addEventListener('click', () => {
                if (!this.hotspotsEnabled) {
                    console.log(`[Hotspots] Click ignored on ${id} (via parent) - hotspots disabled`);
                    return;
                }
                console.log(`[Hotspots] Click detected on ${id} (via parent)`);
                this.activateHotspot(id);
            });
            clickGeometry.addEventListener('mouseover', () => {
                renderer.domElement.style.cursor = 'pointer';
            });
            clickGeometry.addEventListener('mouseout', () => {
                renderer.domElement.style.cursor = 'default';
            });
        }
        
        console.log(`[Hotspots] Registered hotspot: ${id} with InteractionManager`);
    }
    
    activateHotspot(id) {
        console.log(`[Hotspots] activateHotspot called: id=${id}, isAnimating=${this.isAnimating}, hasHotspot=${this.hotspots.has(id)}, hasControls=${!!this.controls}`);
        
        if (this.isAnimating || !this.hotspots.has(id) || !this.controls) {
            console.warn(`[Hotspots] Early return - isAnimating=${this.isAnimating}, hasHotspot=${this.hotspots.has(id)}, hasControls=${!!this.controls}`);
            return;
        }
        
        const hotspot = this.hotspots.get(id);
        this.currentHotspotId = id;
        this.isAnimating = true;
        this.hotspotsEnabled = false; // Disable all hotspots while animating
        this.skipControlsUpdate = true; // Prevent controls from interfering
        
        console.log(`[Hotspots] Activated hotspot: ${id} - hotspots disabled`);
        
        console.log(`[Hotspots] Got hotspot object:`, {
            hasClickGeometry: !!hotspot.clickGeometry,
            hasTargetObj: !!hotspot.targetObj,
            hasCamPos1: !!hotspot.camPos1,
            hasCamPos2: !!hotspot.camPos2
        });
        
        // Record current camera state
        this.lastCameraPos.copy(this.camera.position);
        this.lastCameraTarget.copy(this.controls.target);
        
        console.log(`[Hotspots] Recorded camera state:`, {
            pos: { x: this.lastCameraPos.x.toFixed(2), y: this.lastCameraPos.y.toFixed(2), z: this.lastCameraPos.z.toFixed(2) },
            target: { x: this.lastCameraTarget.x.toFixed(2), y: this.lastCameraTarget.y.toFixed(2), z: this.lastCameraTarget.z.toFixed(2) }
        });
        
        // Disable controls
        this.controls.enableRotate = false;
        this.controls.enableZoom = false;
        this.controls.enablePan = false;
        
        console.log(`[Hotspots] Activated hotspot: ${id}, disabling controls`);
        
        // Animate camera target smoothly
        const startTarget = { 
            x: this.controls.target.x, 
            y: this.controls.target.y, 
            z: this.controls.target.z 
        };
        const endTarget = hotspot.targetObj.position;
        
        console.log(`[Hotspots] Animating target from:`, {
            x: startTarget.x.toFixed(2),
            y: startTarget.y.toFixed(2),
            z: startTarget.z.toFixed(2)
        }, `to:`, {
            x: endTarget.x.toFixed(2),
            y: endTarget.y.toFixed(2),
            z: endTarget.z.toFixed(2)
        });
        
        gsap.to(startTarget, {
            x: endTarget.x,
            y: endTarget.y,
            z: endTarget.z,
            duration: 1.5,
            ease: 'power2.inOut',
            onUpdate: () => {
                this.controls.target.set(startTarget.x, startTarget.y, startTarget.z);
            }
        });
        
        // Animate to camPos1
        console.log(`[Hotspots] Starting animation to camPos1...`);
        this.animateToCamPos(hotspot.camPos1, 1.5, () => {
            console.log(`[Hotspots] Arrived at ${id} camPos1. Waiting for return action...`);
            this.isAnimating = false; // Allow return now
            this.skipControlsUpdate = false; // Allow controls update again
            this.showReturnButton(); // Show return button
        });
    }
    
    animateToCamPos(targetPos, duration, onComplete) {
        console.log(`[Hotspots] Starting camera animation to:`, {
            x: targetPos.position.x,
            y: targetPos.position.y,
            z: targetPos.position.z
        }, `from:`, {
            x: this.camera.position.x,
            y: this.camera.position.y,
            z: this.camera.position.z
        });
        
        return gsap.to(this.camera.position, {
            x: targetPos.position.x,
            y: targetPos.position.y,
            z: targetPos.position.z,
            duration: duration,
            ease: 'power2.inOut',
            paused: false,
            onUpdate: () => {
                console.log(`[Hotspots] Camera pos during anim:`, {
                    x: this.camera.position.x.toFixed(2),
                    y: this.camera.position.y.toFixed(2),
                    z: this.camera.position.z.toFixed(2)
                });
                if (this.controls) this.controls.update();
            },
            onComplete: () => {
                console.log(`[Hotspots] Animation complete to:`, {
                    x: this.camera.position.x.toFixed(2),
                    y: this.camera.position.y.toFixed(2),
                    z: this.camera.position.z.toFixed(2)
                });
                if (onComplete) onComplete();
            }
        });
    }
    
    returnToLastPosition() {
        console.log(`[Hotspots] returnToLastPosition called - isAnimating=${this.isAnimating}, currentHotspotId=${this.currentHotspotId}, hasControls=${!!this.controls}`);
        
        if (this.isAnimating || !this.currentHotspotId || !this.controls) {
            console.warn(`[Hotspots] Early return from returnToLastPosition - isAnimating=${this.isAnimating}, currentHotspotId=${this.currentHotspotId}, hasControls=${!!this.controls}`);
            return;
        }
        
        this.isAnimating = true;
        this.skipControlsUpdate = true; // Prevent controls from interfering during return
        console.log(`[Hotspots] Returning camera to previous position...`);
        
        // Animate target back to original position
        const currentTarget = { 
            x: this.controls.target.x, 
            y: this.controls.target.y, 
            z: this.controls.target.z 
        };
        const originalTarget = this.lastCameraTarget;
        
        console.log(`[Hotspots] Animating target back from:`, {
            x: currentTarget.x.toFixed(2),
            y: currentTarget.y.toFixed(2),
            z: currentTarget.z.toFixed(2)
        }, `to:`, {
            x: originalTarget.x.toFixed(2),
            y: originalTarget.y.toFixed(2),
            z: originalTarget.z.toFixed(2)
        });
        
        gsap.to(currentTarget, {
            x: originalTarget.x,
            y: originalTarget.y,
            z: originalTarget.z,
            duration: 1.5,
            ease: 'power2.inOut',
            onUpdate: () => {
                this.controls.target.set(currentTarget.x, currentTarget.y, currentTarget.z);
            }
        });
        
        // Animate back to last camera position
        gsap.to(this.camera.position, {
            x: this.lastCameraPos.x,
            y: this.lastCameraPos.y,
            z: this.lastCameraPos.z,
            duration: 1.5,
            ease: 'power2.inOut',
            onUpdate: () => {
                if (this.controls) this.controls.update();
            },
            onComplete: () => {
                // Re-enable controls
                this.controls.enableRotate = true;
                this.controls.enableZoom = true;
                this.controls.enablePan = true;
                
                // Re-enable controls update and hotspots
                this.skipControlsUpdate = false;
                this.hotspotsEnabled = true; // Re-enable hotspots
                this.controls.update();
                
                this.isAnimating = false;
                this.currentHotspotId = null;
                
                this.hideReturnButton(); // Hide return button
                
                console.log('[Hotspots] Camera returned, controls re-enabled, hotspots re-enabled');
            }
        });
    }
    
    handleKeyPress(event) {
        if (event.key.toLowerCase() === 'r') {
            console.log(`[Hotspots] R key pressed - attempting return. isAnimating=${this.isAnimating}, currentHotspotId=${this.currentHotspotId}, hasControls=${!!this.controls}`);
            this.returnToLastPosition();
        }
    }

    showReturnButton() {
        if (hotspotReturnBtn) {
            hotspotReturnBtn.style.display = 'block';
            console.log('[Hotspots] Return button shown');
        }
    }

    hideReturnButton() {
        if (hotspotReturnBtn) {
            hotspotReturnBtn.style.display = 'none';
            console.log('[Hotspots] Return button hidden');
        }
    }
}

// Barrier Animation Manager
class BarrierAnimationManager {
    constructor(scene) {
        this.scene = scene;
        this.barriers = new Map(); // Map of barrier names to barrier state
    }

    registerBarrier(barrierId, clickObjectName, animationClipName) {
        // Get the click object and animation action
        const clickObj = this.scene.getObjectByName(clickObjectName);
        
        if (!clickObj) {
            console.warn(`[Barriers] Click object not found: ${clickObjectName}`);
            return false;
        }

        // Set click object properties: invisible and no shadows
        clickObj.visible = false;
        clickObj.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
            }
        });

        console.log(`[Barriers] Configured click object ${clickObjectName}: hidden, no shadows`);

        // Create barrier state object
        const barrierState = {
            barrierId,
            clickObj,
            clickObjectName,
            animationClipName,
            isAnimating: false,
            action: null, // Will be set when animation is ready
            animationStartTime: 0,
            animationDuration: 0
        };

        this.barriers.set(barrierId, barrierState);

        // Register click handler
        this.registerClickHandler(barrierId);

        console.log(`[Barriers] Registered barrier: ${barrierId}`);
        return true;
    }

    registerClickHandler(barrierId) {
        const barrier = this.barriers.get(barrierId);
        if (!barrier) return;

        const clickObj = barrier.clickObj;

        // Add to interaction manager
        if (clickObj.geometry) {
            interactionManager.add(clickObj);
            clickObj.addEventListener('click', () => this.onClickObject(barrierId));
            clickObj.addEventListener('mouseover', () => {
                renderer.domElement.style.cursor = 'pointer';
            });
            clickObj.addEventListener('mouseout', () => {
                renderer.domElement.style.cursor = 'default';
            });
        } else {
            // If group, add children
            clickObj.traverse((child) => {
                if (child.isMesh && child.geometry) {
                    interactionManager.add(child);
                    child.addEventListener('click', () => this.onClickObject(barrierId));
                    child.addEventListener('mouseover', () => {
                        renderer.domElement.style.cursor = 'pointer';
                    });
                    child.addEventListener('mouseout', () => {
                        renderer.domElement.style.cursor = 'default';
                    });
                }
            });
            // Also add parent
            interactionManager.add(clickObj);
            clickObj.addEventListener('click', () => this.onClickObject(barrierId));
            clickObj.addEventListener('mouseover', () => {
                renderer.domElement.style.cursor = 'pointer';
            });
            clickObj.addEventListener('mouseout', () => {
                renderer.domElement.style.cursor = 'default';
            });
        }

        console.log(`[Barriers] Click handler registered for ${barrierId}`);
    }

    onClickObject(barrierId) {
        const barrier = this.barriers.get(barrierId);
        if (!barrier) return;

        // Ignore click if already animating
        if (barrier.isAnimating) {
            console.log(`[Barriers] Click ignored on ${barrierId} - already animating`);
            return;
        }

        // Check if animation action is available
        if (!barrier.action) {
            console.warn(`[Barriers] No animation action for ${barrierId}`);
            return;
        }

        console.log(`[Barriers] Click detected on ${barrierId} - playing animation ${barrier.animationClipName}`);

        // Mark as animating
        barrier.isAnimating = true;

        // Configure action for single play
        barrier.action.reset();
        barrier.action.clampWhenFinished = true; // Clamp to the last frame
        barrier.action.loop = THREE.LoopOnce; // Play only once
        
        // Record animation start time and duration
        barrier.animationStartTime = clock.getElapsedTime();
        barrier.animationDuration = barrier.action.getClip().duration;
        
        console.log(`[Barriers] Animation started for ${barrierId}, duration: ${barrier.animationDuration.toFixed(2)}s`);
        
        barrier.action.play();
    }

    update() {
        // Check all barriers for animation completion
        this.barriers.forEach((barrier) => {
            if (barrier.isAnimating) {
                const elapsedTime = clock.getElapsedTime() - barrier.animationStartTime;
                
                // Animation is complete when elapsed time exceeds duration
                if (elapsedTime >= barrier.animationDuration) {
                    console.log(`[Barriers] Animation finished for ${barrier.barrierId}`);
                    barrier.isAnimating = false;
                }
            }
        });
    }

    setAnimationAction(barrierId, action) {
        const barrier = this.barriers.get(barrierId);
        if (barrier) {
            barrier.action = action;
            console.log(`[Barriers] Animation action set for ${barrierId}`);
        }
    }
}


// Animation mixer and clips
let mixer = null;
const clipActions = new Map(); // Map clip names to actions for on-demand playback

// Create hotspot manager (will be initialized after model loads)
let hotspotManager = null;
let barrierAnimationManager = null;

const loader = new GLTFLoader().setPath('./models/');
const ktx2Loader = new KTX2Loader().setTranscoderPath('./libs/basis/').detectSupport(renderer);
loader.setKTX2Loader(ktx2Loader);

const boxTemplateNames = ['box1_colour1', 'box1_colour2', 'box1_colour3', 'box1_colour4', 'box1_colour5'];
const palletTemplateName = 'pallet';
const kitchenChairTemplateName = 'kitchen_chair';
const boxWeights = [
    { name: 'box1_colour1', weight: 0.5 },
    { name: 'box1_colour2', weight: 0.125 },
    { name: 'box1_colour3', weight: 0.125 },
    { name: 'box1_colour4', weight: 0.125 },
    { name: 'box1_colour5', weight: 0.125 }
];

function pickWeighted(weights) {
    const total = weights.reduce((sum, entry) => sum + entry.weight, 0);
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
        r -= weights[i].weight;
        if (r <= 0) return weights[i].name;
    }
    return weights[weights.length - 1].name;
}

function getFirstMeshByName(root, name) {
    const base = root.getObjectByName(name);
    if (!base) return null;
    let mesh = null;
    base.traverse((child) => {
        if (!mesh && child.isMesh) {
            mesh = child;
        }
    });
    return mesh;
}
    

function buildInstancedMesh(templateMesh, markers) {
    if (!templateMesh || !markers.length) return null;
    const instanced = new THREE.InstancedMesh(templateMesh.geometry, templateMesh.material, markers.length);
    instanced.castShadow = true;
    instanced.receiveShadow = true;
    markers.forEach((marker, index) => {
        marker.updateWorldMatrix(true, false);
        instanced.setMatrixAt(index, marker.matrixWorld);
    });
    instanced.instanceMatrix.needsUpdate = true;
    instanced.name = `instanced_${templateMesh.name}`;
    return instanced;
}

loader.load('warehouse_exp.glb', (gltf) => {
    gltf.scene.traverse(function(child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
        }
    });

    const mesh = gltf.scene;

    
    // Disable shadows on background_assets AFTER global enable, traversing all children
    const bgAssets = mesh.getObjectByName('background_assets');
    if (bgAssets) {
        bgAssets.traverse(function(child) {
            if (child.isMesh) {
                child.castShadow = false;
                child.receiveShadow = false;
            }
        });
    }
    
    scene.add(mesh);
    meshLoaded = true;

    // Set up animations BEFORE updating world matrices
    if (gltf.animations && gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(gltf.scene);
        
        // Barrier animations that should NOT auto-play
        const nonAutoPlayAnimations = ['barrierL_anim', 'barrierR_anim'];
        
        gltf.animations.forEach((clip) => {
            const action = mixer.clipAction(clip);
            clipActions.set(clip.name, action);
            
            // Auto-play all animations except barrier animations
            if (!nonAutoPlayAnimations.includes(clip.name)) {
                action.play();
                console.log(`[Animation] Playing: ${clip.name}`);
            } else {
                console.log(`[Animation] Registered (manual): ${clip.name}`);
            }
        });
        console.log(`[Animation] Total animations: ${gltf.animations.length}`);
    } else {
        console.log('[Animation] No animations found in model');
    }

    gltf.scene.updateWorldMatrix(true, true);

    const boxMarkers = [];
    const palletMarkers = [];
    const kitchenChairMarkers = [];
    gltf.scene.traverse((child) => {
        if (!child.name) return;
        if (child.name.startsWith('markerbox')) {
            boxMarkers.push(child);
        } else if (child.name.startsWith('markerpallet')) {
            palletMarkers.push(child);
        } else if (child.name.startsWith('markerkitchen_chair')) {
            kitchenChairMarkers.push(child);
        }

    });

    const boxTemplates = new Map();
    boxTemplateNames.forEach((name) => {
        const meshRef = getFirstMeshByName(gltf.scene, name);
        if (meshRef) {
            boxTemplates.set(name, meshRef);
            meshRef.visible = false;
        } else {
            console.warn(`Box template not found: ${name}`);
        }
    });

    const palletTemplate = getFirstMeshByName(gltf.scene, palletTemplateName);
    if (palletTemplate) {
        palletTemplate.visible = false;
    } else {
        console.warn(`Pallet template not found: ${palletTemplateName}`);
    }

    const kitchenChairTemplate = getFirstMeshByName(gltf.scene, kitchenChairTemplateName);
    if (kitchenChairTemplate) {
        kitchenChairTemplate.visible = false;
    } else {
        console.warn(`Kitchen chair template not found: ${kitchenChairTemplateName}`);
    }

    const boxAssignments = new Map();
    boxMarkers.forEach((marker) => {
        const pick = pickWeighted(boxWeights);
        const bucket = boxAssignments.get(pick) || [];
        bucket.push(marker);
        boxAssignments.set(pick, bucket);
    });

    boxAssignments.forEach((markers, templateName) => {
        const templateMesh = boxTemplates.get(templateName);
        const instanced = buildInstancedMesh(templateMesh, markers);
        if (instanced) {
            scene.add(instanced);
        }
    });

    const palletInstanced = buildInstancedMesh(palletTemplate, palletMarkers);
    if (palletInstanced) {
        scene.add(palletInstanced);
    }

    const kitchenChairInstanced = buildInstancedMesh(kitchenChairTemplate, kitchenChairMarkers);
    if (kitchenChairInstanced) {
        scene.add(kitchenChairInstanced);
    }

    // Set up pallet turner interaction
    const palletTurner = gltf.scene.getObjectByName('animated_palletTurner');
    if (palletTurner) {
        palletTurnerSpinState.object = palletTurner;
        
        // Register with InteractionManager and add click handler
        interactionManager.add(palletTurner);
        palletTurner.addEventListener('click', () => {
            // Apply initial spin velocity (3 rotations per second)
            palletTurnerSpinState.angularVelocity = Math.PI * 3;
        });
        palletTurner.addEventListener('mouseover', () => {
            renderer.domElement.style.cursor = 'pointer';
        });
        palletTurner.addEventListener('mouseout', () => {
            renderer.domElement.style.cursor = 'default';
        });
    } else {
        console.warn('palletTurner object not found in scene');
    }

    // Set up video texture for laptop screen
    const laptopScreen = gltf.scene.getObjectByName('laptopScreen1');
    if (laptopScreen && laptopScreen.isMesh) {
        // Create video element
        const video = document.createElement('video');
        video.src = './videos/laptop_rageMan_looped.mp4';
        video.crossOrigin = 'anonymous';
        video.loop = true;
        video.muted = true;
        video.playsinline = true;
        
        // Create texture from video
        const videoTexture = new THREE.VideoTexture(video);
        videoTexture.flipY = false;
        videoTexture.colorSpace = THREE.SRGBColorSpace;
        
        // Create unlit material (MeshBasicMaterial) - no color, just the video
        laptopScreen.material.map = videoTexture;
        laptopScreen.material.needsUpdate = true;
        
        // Play video
        video.play().catch(err => {
            console.warn('[Video] Autoplay failed, video will play on first interaction:', err);
        });
        
        console.log('[Video] Laptop screen texture initialized (unlit material)');
    } else {
        console.warn('laptopScreen1 object not found in scene');
    }

    // Set up video texture for animated monitor 1
    const animatedMonitor1 = gltf.scene.getObjectByName('animatedMonitor1');
    if (animatedMonitor1 && animatedMonitor1.isMesh) {
        // Create video element
        const video1 = document.createElement('video');
        video1.src = './videos/LT_screens_256x128.mp4';
        video1.crossOrigin = 'anonymous';
        video1.loop = true;
        video1.muted = true;
        video1.playsinline = true;
        
        // Create texture from video
        const videoTexture1 = new THREE.VideoTexture(video1);
        videoTexture1.flipY = false;
        videoTexture1.colorSpace = THREE.SRGBColorSpace;
        
        // Apply to material
        animatedMonitor1.material.map = videoTexture1;
        animatedMonitor1.material.needsUpdate = true;
        
        // Play video
        video1.play().catch(err => {
            console.warn('[Video] Autoplay failed for animatedMonitor1, video will play on first interaction:', err);
        });
        
        console.log('[Video] Animated monitor 1 texture initialized');
    } else {
        console.warn('animatedMonitor1 object not found in scene');
    }

    // Set up video texture for animated monitor 2
    const animatedMonitor2 = gltf.scene.getObjectByName('animatedMonitor2');
    if (animatedMonitor2 && animatedMonitor2.isMesh) {
        // Create video element
        const video2 = document.createElement('video');
        video2.src = './videos/sol_screen_256x128.mp4';
        video2.crossOrigin = 'anonymous';
        video2.loop = true;
        video2.muted = true;
        video2.playsinline = true;
        
        // Create texture from video
        const videoTexture2 = new THREE.VideoTexture(video2);
        videoTexture2.flipY = false;
        videoTexture2.colorSpace = THREE.SRGBColorSpace;
        
        // Apply to material
        animatedMonitor2.material.map = videoTexture2;
        animatedMonitor2.material.needsUpdate = true;
        
        // Play video
        video2.play().catch(err => {
            console.warn('[Video] Autoplay failed for animatedMonitor2, video will play on first interaction:', err);
        });
        
        console.log('[Video] Animated monitor 2 texture initialized');
    } else {
        console.warn('animatedMonitor2 object not found in scene');
    }

    // Initialize hotspot manager
    hotspotManager = new HotspotManager(camera, scene);
    
    // Auto-discover and register hotspots (hs1-hs5)
    for (let i = 1; i <= 5; i++) {
        const clickGeom = gltf.scene.getObjectByName(`hs${i}_click`);
        const targetObj = gltf.scene.getObjectByName(`hs${i}_target`);
        const camPos1 = gltf.scene.getObjectByName(`hs${i}_camPos1`);
        
        if (clickGeom && targetObj && camPos1) {
            hotspotManager.registerHotspot(`hs${i}`, clickGeom, targetObj, camPos1);
        }
    }

    // Initialize barrier animation manager
    barrierAnimationManager = new BarrierAnimationManager(gltf.scene);
    
    // Register barriers with their animations
    const barriers = [
        { id: 'barrierLeft', clickObj: 'barrierL_click', animClip: 'barrierL_anim' },
        { id: 'barrierRight', clickObj: 'barrierR_click', animClip: 'barrierR_anim' }
    ];
    
    barriers.forEach((barrier) => {
        if (barrierAnimationManager.registerBarrier(barrier.id, barrier.clickObj, barrier.animClip)) {
            // Get animation action and set it on the barrier
            const action = clipActions.get(barrier.animClip);
            if (action) {
                barrierAnimationManager.setAnimationAction(barrier.id, action);
                console.log(`[Barriers] Animation action linked for ${barrier.id}`);
            } else {
                console.warn(`[Barriers] Animation clip not found: ${barrier.animClip}`);
            }
        }
    });
    
    // Set controls after hotspot manager is fully initialized
    // This must be done inside the loader callback since controls exist globally
    setTimeout(() => {
        if (hotspotManager && typeof controls !== 'undefined') {
            hotspotManager.setControls(controls);
            console.log('[Hotspots] Controls linked to hotspot manager');
        }
    }, 0);
        
});

// Add lights
const light1 = new THREE.DirectionalLight(0xFFE9D2, 5)
light1.position.set(12, 20, -12);
light1.castShadow = true;
light1.shadow.normalBias = 0.02;
light1.shadow.camera.left = -36;
light1.shadow.camera.right = 35;
light1.shadow.camera.top = 35;
light1.shadow.camera.bottom = -30;
light1.shadow.camera.near = 1;
light1.shadow.camera.far = 51;
light1.shadow.mapSize.width = 2048;
light1.shadow.mapSize.height = 2048;
light1.shadow.bias = -0.0001;
light1.shadow.autoUpdate = false;

scene.add(light1);

// Fill light on opposite side (cooler, no shadows)
const light2 = new THREE.DirectionalLight(0xDDEBFF, 0.5);
light2.position.set(-10, 15, 12);
light2.castShadow = false;
scene.add(light2);

// Helpers to visualize light direction and shadow frustum
//const light1Helper = new THREE.DirectionalLightHelper(light1, 5);
//const light1ShadowHelper = new THREE.CameraHelper(light1.shadow.camera);
//scene.add(light1Helper);
//scene.add(light1ShadowHelper);

// Controls for the camera orbit
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = isMobile ? 0.15 : 0.15; // Ultra-low on iPad to minimize allocations
controls.enablePan = true;
controls.autoRotate = false;
controls.maxDistance = 150;
controls.minDistance = 3;
controls.maxPolarAngle = 0.85;
controls.minPolarAngle = 0.85;
controls.target = new THREE.Vector3(0, 0, 0);
controls.update();

//Render loop
let lastFrameTime = 0;
const targetFrameTime = isMobile ? 17 : 16; // Target 60fps but allow slight variance on mobile

// Shadow update configuration
const SHADOW_UPDATE_INTERVAL = 1; // Update light shadows every n frames
let shadowUpdateFrameCounter = 0;

function updateLightShadows() {
    if (light1) {
        light1.shadow.needsUpdate = true;
    }
}

function render(){    
    const deltaTime = clock.getDelta();

    // Update animations every frame
    if (mixer) {
        mixer.update(deltaTime);
    }

    // Update barrier animations (track completion)
    if (barrierAnimationManager) {
        barrierAnimationManager.update();
    }

    // Update pallet turner spin with deceleration
    if (palletTurnerSpinState.object && palletTurnerSpinState.angularVelocity !== 0) {
        // Apply deceleration
        palletTurnerSpinState.angularVelocity -= palletTurnerSpinState.deceleration * deltaTime;
        
        // Stop spinning if velocity is very small
        if (palletTurnerSpinState.angularVelocity < 0.01) {
            palletTurnerSpinState.angularVelocity = 0;
        }
        
        // Rotate the object around Y axis
        palletTurnerSpinState.object.rotation.y += palletTurnerSpinState.angularVelocity * deltaTime;
    }

    // Only update controls if not in a hotspot animation
    if (!hotspotManager || !hotspotManager.skipControlsUpdate) {
        controls.update();
    }
    
    // Update light shadows every n frames
    shadowUpdateFrameCounter++;
    if (shadowUpdateFrameCounter >= SHADOW_UPDATE_INTERVAL) {
        updateLightShadows();
        shadowUpdateFrameCounter = 0;
    }
    
    requestAnimationFrame(render);
    if (showPerfMonitor) {
        perfMonitor.recordFrame();
        updateMetrics();
    }
    renderer.render(scene, camera);
    interactionManager.update();
}

render();