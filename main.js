import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InteractionManager } from 'three.interactive';

// Set up variables
var meshLoaded = false;
const clock = new THREE.Clock();

// Pallet turner spin state
let palletTurnerSpinState = {
    object: null,
    angularVelocity: 0, // radians per second
    deceleration: 2.5 // deceleration factor (radians per second squared)
};


// Set up Renderer
// Disable antialias on mobile to reduce GPU pressure and memory allocation
const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const renderer = new THREE.WebGLRenderer({antialias: !isMobile, powerPreference: 'high-performance'});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xfaf7f3);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.5;
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
const showPerfMonitor = !isMobile;
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

// Add camera
const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(35, 40, 35);

const interactionManager = new InteractionManager(renderer, camera, renderer.domElement);

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
    scene.add(mesh);
    meshLoaded = true;

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
    const palletTurner = gltf.scene.getObjectByName('palletTurner');
    if (palletTurner) {
        palletTurnerSpinState.object = palletTurner;
        
        // Register with InteractionManager and add click handler
        interactionManager.add(palletTurner);
        palletTurner.addEventListener('click', () => {
            // Apply initial spin velocity (3 rotations per second)
            palletTurnerSpinState.angularVelocity = Math.PI * 3;
        });
    } else {
        console.warn('palletTurner object not found in scene');
    }
        
});

// Add lights
const light1 = new THREE.DirectionalLight(0xFFE9D2, 5)
light1.position.set(5, 25, -5);
light1.castShadow = true;
light1.shadow.normalBias = 0.02;
light1.shadow.camera.left = -25;
light1.shadow.camera.right = 25;
light1.shadow.camera.top = 25;
light1.shadow.camera.bottom = -25;
light1.shadow.camera.near = 5;
light1.shadow.camera.far = 45;
light1.shadow.mapSize.width = 512;
light1.shadow.mapSize.height = 512;
light1.shadow.bias = -0.0001

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
controls.dampingFactor = isMobile ? 0.015 : 0.03; // Ultra-low on iPad to minimize allocations
controls.enablePan = true;
controls.autoRotate = false;
controls.maxDistance = 150;
controls.minDistance = 3;
controls.maxPolarAngle = 0.95;
controls.minPolarAngle = 0.95;
controls.target = new THREE.Vector3(0, 0, 0);
controls.update();

/*
// Post-processing pipeline
const composer = new EffectComposer(renderer);
composer.multisampling = renderer.capabilities.isWebGL2 ? 4 : 1; // multisample in post if available

const renderPass = new RenderPass(scene, camera);
const ssaoPass = new SSAOPass(scene, camera, window.innerWidth, window.innerHeight);
ssaoPass.kernelRadius = 0.75;
ssaoPass.minDistance = 0.002;
ssaoPass.maxDistance = 1;
//const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.15, 0.5, 0.8);
const outputPass = new OutputPass();
composer.addPass(renderPass);
composer.addPass(ssaoPass);
//composer.addPass(bloomPass);
composer.addPass(outputPass);

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    ssaoPass.setSize(window.innerWidth, window.innerHeight);
    //bloomPass.setSize(window.innerWidth, window.innerHeight);
});
*/

//Render loop
let lastFrameTime = 0;
const targetFrameTime = isMobile ? 17 : 16; // Target 60fps but allow slight variance on mobile

function render(){    
    const deltaTime = clock.getDelta();

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

    controls.update();
    requestAnimationFrame(render);
    if (showPerfMonitor) {
        perfMonitor.recordFrame();
        updateMetrics();
    }
    //composer.render();
    renderer.render(scene, camera);
}

render();