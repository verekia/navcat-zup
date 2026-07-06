import * as THREE from 'three/webgpu';

// navcat-zup uses a z-up coordinate system, so configure threejs to use z-up as well
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

export type ExampleBase = {
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    renderer: THREE.WebGPURenderer
}

export const createExample = async (container: HTMLElement): Promise<ExampleBase> => {
    // scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x202020);

    // camera
    const camera = new THREE.PerspectiveCamera(
        75,
        container.clientWidth / container.clientHeight,
        0.1,
        1000,
    );
    camera.position.set(5, 0, 0);

    // renderer
    const renderer = new THREE.WebGPURenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    
    container.appendChild(renderer.domElement);

    // lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);

    // resize handling
    function onWindowResize() {
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    }
    window.addEventListener('resize', onWindowResize);
    
    await renderer.init();

    return {
        scene,
        camera,
        renderer,
    };
}
