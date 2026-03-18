import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { InteractionManager } from 'three.interactive';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Set up variables
var meshLoaded = false;
const clock = new THREE.Clock();


// Set up Renderer
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0xfaf7f3);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.LinearToneMapping
renderer.toneMappingExposure = 1.6;
document.body.appendChild(renderer.domElement);

// Lightweight FPS display
const fpsDisplay = document.createElement('div');
fpsDisplay.style.position = 'fixed';
fpsDisplay.style.top = '10px';
fpsDisplay.style.left = '10px';
fpsDisplay.style.padding = '6px 10px';
fpsDisplay.style.background = 'rgba(0,0,0,0.6)';
fpsDisplay.style.color = '#f5f5f5';
fpsDisplay.style.fontFamily = 'monospace';
fpsDisplay.style.fontSize = '12px';
fpsDisplay.style.zIndex = '10';
fpsDisplay.textContent = 'FPS: --';
document.body.appendChild(fpsDisplay);

let fpsFrames = 0;
let fpsLastTime = performance.now();

function updateFps() {
    fpsFrames += 1;
    const now = performance.now();
    if (now - fpsLastTime >= 500) { // update twice a second
        const fps = Math.round((fpsFrames * 1000) / (now - fpsLastTime));
        fpsDisplay.textContent = `FPS: ${fps}`;
        fpsFrames = 0;
        fpsLastTime = now;
    }
}

// Set up Scene
const scene = new THREE.Scene();
const environmentTexture = new THREE.CubeTextureLoader().setPath('./env/').load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);
scene.environment = environmentTexture;
scene.environmentIntensity = 1.75;

// Add camera
const camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(35, 40, 35);

const interactionManager = new InteractionManager(renderer, camera, renderer.domElement);

const loader = new GLTFLoader().setPath('./models/');

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
        
});

// Add lights
const light1 = new THREE.DirectionalLight(0xFFE9D2, 5)
light1.position.set(10, 20, -10);
light1.castShadow = true;

light1.shadow.normalBias = 0.02;
light1.shadow.camera.left = -25;
light1.shadow.camera.right = 25;
light1.shadow.camera.top = 25;
light1.shadow.camera.bottom = -25;
light1.shadow.camera.near = 5;
light1.shadow.camera.far = 45;
light1.shadow.mapSize.width = 1024;
light1.shadow.mapSize.height = 2048;
light1.shadow.bias = -0.0001

scene.add(light1);

// Fill light on opposite side (cooler, no shadows)
const light2 = new THREE.DirectionalLight(0xDDEBFF, .5);
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
function render(){    

    controls.update();
    requestAnimationFrame(render);    
    updateFps();
    //composer.render();
    renderer.render(scene, camera);
}

render();