import { Group, Box3, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import MODEL from './land.gltf';
import { BoxGeometry, MeshBasicMaterial, Mesh } from 'three';
import { createConvexPolyhedronFromGeometry, mergeVerticesAndFaces } from '../Building/Building.js';

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
    constructor(parent, startingPos, material, 
        mass = 0, collisionFilterGroup = -1, collisionFilterMask = -1, linearDamping = 0, angularDamping = 0, fixedRotation = true) { // heuristical
        // Call parent Group() constructor
        super();

        const loader = new GLTFLoader();

        this.name = 'land';

        // Init state, variable specific to this object. (TODO: tune them later)
        this.state = {
            colliderOffset: new Vector3(0, 0, 0), // manually tuning the offset needed for mesh visualization to match the physical collider
        };

        loader.load(MODEL, (gltf) => {
            // Initialize physical properties of each land part in the file, following the convention
            this.traverseAndInitPieces(parent, gltf.scene.children, startingPos, mass, material, collisionFilterGroup, collisionFilterMask, linearDamping, angularDamping, fixedRotation);
            // Visualize the whole scene, since all landshapes are static.
            this.add(gltf.scene);

            // Update Three.js object position to match Cannon.js body position (Two different systems)
            this.position.copy(startingPos); // this.body.position. Since the shape is static, no need for constant update. Should be 1 to 1 coord ratio.
            this.position.add(this.state.colliderOffset);
        });
    }

    // Convention: When given a gltf scene, the initial children objects ALL represent the land parts. (make sure to not export other stuff)
    // Goal is to traverse each land part and generate a unique convex collider for it to cover depth etc.
    // But this requires that in the GLTF file, mountains etc should be its own obj on top of the land.
    // AGAIN, DON'T FORGET TO SCALE TO 1! COLLIDER OFF = NOT SCALED TO 1!
    traverseAndInitPieces(parent, childObjs, startingPos, mass, material, collisionFilterGroup, collisionFilterMask, linearDamping, angularDamping, fixedRotation) {
        for (let i = 0; i < childObjs.length; i++) {
            // Grab the part meshes
            let childObj = childObjs[i]; // current part
            const submeshes = []; // meshes within this part
            childObj.traverse((child) => { // childObj is also included in the traversal. MAYBE???
                if (child.isMesh) {
                    submeshes.push(child);
                }
            });

            // Spawn in a collider for that part
            const info = mergeVerticesAndFaces(submeshes);
            const shape = createConvexPolyhedronFromGeometry(info); // generating a convex-hulled, shape-specific collider

            // Add in the collider for that part
            const body = new CANNON.Body({
                mass: mass, // most likely 0. Land shouldn't be moving.
                shape: shape,
                material: material,
                position: new Vector3().copy(childObj.position).add(startingPos), // object.position.add(startingPos), either one works
                linearDamping: linearDamping, // most likely 0. Land shouldn't be moving.
                angularDamping: angularDamping, // most likely 0. Land shouldn't be moving.
                fixedRotation: fixedRotation, // most likely true. Land shouldn't be moving.
                collisionFilterGroup: collisionFilterGroup,
                collisionFilterMask: collisionFilterMask,
            });
            body.updateMassProperties(); // Need to call this after setting up the parameters.
          
            // Add the Cannon.js body to the world
            parent.state.world.addBody(body); 
        }
    }

    /*initPhysics(parent, gltf, startingPos, material) { // obj file can directly pass in obj as parameter.
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
        // this.colliderMesh = createBoxColliderMesh(this.body);
        // this.colliderMesh.position.copy(this.body.position);
        // parent.add(this.colliderMesh);
    }*/
}

export default Land;
