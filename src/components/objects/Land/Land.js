import { Group, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import MODEL from './land.gltf';
import { BoxGeometry, MeshBasicMaterial, Mesh } from 'three';

function createBoxColliderMesh(landBody) { // A helper function for visualizing a box collider
    console.log(landBody);
    const boxShape = landBody.shapes[0];
    const geometry = new BoxGeometry(
        boxShape.halfExtents.x * 2, // don't forget to *2 since half-size
        boxShape.halfExtents.y * 2,
        boxShape.halfExtents.z * 2
    );

    const material = new MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 1,
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.copy(landBody.position);
    mesh.quaternion.copy(landBody.quaternion);

    return mesh;
}

// IMPORTANT: We are going to assume the collider mesh of the land is a BOX for simplicity. So please use flat land assets.
// Otherwise, employ the same methods from Building.js to obtain convex polyhedron collider mesh.

class Land extends Group {
    constructor(parent, startingPos, material) {
        // Call parent Group() constructor
        super();

        const loader = new GLTFLoader();

        this.name = 'land';

        // Init state, variable specific to this object. (TODO: tune them later)
        this.state = {
            colliderOffset: new Vector3(0, 0, 0), // manually tuning the offset needed for mesh visualization to match the physical collider
        };

        loader.load(MODEL, (gltf) => {
            this.add(gltf.scene);
        
            // Initialize physical properties of the object
            this.initPhysics(parent, gltf, startingPos, material);

            // Update Three.js object position to match Cannon.js body position (Two different systems)
            this.position.copy(this.body.position);
            this.position.add(this.state.colliderOffset);
        });
    }

    initPhysics(parent, gltf, startingPos, material) { // obj file can directly pass in obj as parameter.
        // let landShape = new CANNON.Box(new CANNON.Vec3(10, 0.1, 10)); // if dim matches that of in Blender, then exact fit.
        // All these code extracts the bounding box from the input mesh and uses that bounding box as the box collider
        let landShape;
        gltf.scene.traverse((object) => {
            if (object.isMesh) {
                if (object.name == "Cube") landShape = object; // TODO: "Cube" is the name of the mesh in Blender hierarchy. Update for new mesh!
            }
        });
        landShape.updateMatrixWorld(true);
        landShape = new Box3().setFromObject(landShape);
        const size = new Vector3();
        landShape.getSize(size);
        const halfSize = size.multiplyScalar(0.5);
        landShape = new CANNON.Box(new CANNON.Vec3(halfSize.x, halfSize.y, halfSize.z)); // Cannon.box takes in halfSizes.

        // Create Cannon.js body for the land
        this.body = new CANNON.Body({
            mass: 0, // The land is static, so its mass is set to 0
            shape: landShape, // Use a suitable shape for the land model, e.g. Box, Cylinder, etc.
            material: material,
            position: startingPos, // Set the position according to your land model
        });

        this.body.updateMassProperties(); // Need to call this after setting up the parameters.

        parent.state.world.addBody(this.body);

        // for debugging: visualizing collider
        /*this.colliderMesh = createBoxColliderMesh(this.body);
        this.colliderMesh.position.copy(this.body.position);
        parent.add(this.colliderMesh);*/
    }
}

export default Land;
