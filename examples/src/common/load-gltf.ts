import { Matrix4, Quaternion, Vector3 } from 'three';
import { DRACOLoader, type GLTF, GLTFLoader } from 'three/examples/jsm/Addons.js';
import dracoWasmUrl from 'three/examples/jsm/libs/draco/draco_decoder.wasm?url';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

const dracoDecoderPath = dracoWasmUrl.substring(0, dracoWasmUrl.lastIndexOf('/') + 1);

// gltf assets are y-up, but navcat-zup and these examples use a z-up world.
// this rotation maps asset x -> world y, asset y (up) -> world z (up), asset z -> world x,
// matching the axis rotation used to convert navcat to navcat-zup.
const Y_UP_TO_Z_UP = new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0)),
);

export const loadGLTF = async (url: string): Promise<GLTF> => {
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath(dracoDecoderPath);

    const gltfLoader = new GLTFLoader();
    gltfLoader.setDRACOLoader(dracoLoader);
    gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    const gltf = await gltfLoader.loadAsync(url);

    // rotate the y-up gltf scene into the z-up world
    gltf.scene.quaternion.premultiply(Y_UP_TO_Z_UP);
    gltf.scene.updateMatrixWorld(true);

    return gltf;
};
