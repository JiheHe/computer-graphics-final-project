import { Group, Box3, Face3, Vector3, Quaternion } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import MODEL from './land.gltf';
import { BoxGeometry, MeshBasicMaterial, Mesh, Geometry } from 'three';
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

/*function createVisualFromCannonBody(scene, shape, body, materialOptions) {
    // convert the vertices to THREE.Vector3
    var vertices = shape.vertices.map(function(v) {
        return new Vector3(v.x, v.y, v.z);
    });

    // convert the faces to an array of vertex indices
    var faces = shape.faces.map(function(face) {
        // note: THREE.Face3 only supports triangles, so we need to ensure our faces are all triangles
        // this code assumes all faces are either triangles or quadrilaterals
        // you might need to add additional logic here if your faces can have more vertices
        if (face.length === 3) {
            return new Face3(face[0], face[1], face[2]);
        } else if (face.length === 4) {
            return [
                new Face3(face[0], face[1], face[2]),
                new Face3(face[0], face[2], face[3])
            ];
        }
    }).flat();  // flatten the array

    // create the geometry
    var geometry = new Geometry();
    geometry.vertices = vertices;
    geometry.faces = faces;
    // geometry.computeFaceNormals();  // optional, helps with lighting

    // create the mesh
    var material = new MeshBasicMaterial(materialOptions);
    var mesh = new Mesh(geometry, material);
    scene.add(mesh);  // assuming `scene` is your THREE.Scene

    // return a function for updating the mesh
    mesh.position.copy(body.position);
    mesh.quaternion.copy(body.quaternion);
}*/

function randomInclusive(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// IMPORTANT: We are going to assume the base of the land is essentially/strictly a box with NO out of boundary reach, so it's up to the user 
// to input correctly "tiled" land meshes for us to work with.

class Land extends Group {
    constructor(parent, startingPos, materiaL, boundaryWallParams, riserLandY,
        mass = 0, collisionFilterGroup = 0b00010, collisionFilterMask = -1, linearDamping = 0, angularDamping = 0, fixedRotation = true) { // heuristical
        // Call parent Group() constructor
        super();

        const loader = new GLTFLoader();

        this.name = 'land';
        this.riserLandY = riserLandY;
        this.parentObj = parent;

        // Init state, variable specific to this object. (TODO: tune them later)
        this.state = {
            colliderOffset: new Vector3(0, 0, 0), // manually tuning the offset needed for mesh visualization to match the physical collider
        };

        loader.load(MODEL, (gltf) => {
            // Initialize physical properties of each land part in the file, following the convention
            this.traverseAndInitPieces(parent, gltf.scene.children, startingPos, boundaryWallParams, mass, materiaL, collisionFilterGroup, collisionFilterMask, linearDamping, angularDamping, fixedRotation);
            // Visualize the whole scene, since all landshapes are static.
            this.add(gltf.scene);
            console.log(gltf.scene);

            // Update Three.js object position to match Cannon.js body position (Two different systems)
            this.position.copy(startingPos); // this.body.position. Since the shape is static, no need for constant update. Should be 1 to 1 coord ratio.
            this.position.add(this.state.colliderOffset);

            // // Spawn in sea level riser box (too lazy to do a helper)
            // const bufferGeometry = gltf.scene.children[0].geometry; // assume buffered geometry.
            // bufferGeometry.computeBoundingBox();
            // const boundingBox = bufferGeometry.boundingBox;
            // // physical
            // const shape = new CANNON.Box(new CANNON.Vec3((boundingBox.max.x - boundingBox.min.x) / 2, 0.25, (boundingBox.max.z - boundingBox.min.z) / 2));
            // const body = new CANNON.Body({  // invisible collider properties
            //     mass: 0,  // static
            //     shape: shape,
            //     material: new CANNON.Material({friction: 0.5, restitution: 0.5}),
            //     position: new CANNON.Vec3(startingPos.x, riserLandY.start, startingPos.z),
            //     collisionFilterGroup: 0b100000, 
            //     collisionFilterMask: 0b010001, // Only collides with player and water particles
            // });
            // body.updateMassProperties(); // Need to call this after setting up the parameters.
            // parent.bodyIDToString[body.id] = "SeaLevel";
            // parent.state.world.addBody(body);
            // // visual
            // const geometry = new BoxGeometry(
            //     (boundingBox.max.x - boundingBox.min.x), // don't forget to *2 since half-size
            //     0.25 * 2,
            //     (boundingBox.max.z - boundingBox.min.z)
            // );
            // const material = new MeshBasicMaterial({
            //     color: 0x0000ff,
            //     transparent: true,
            //     opacity: 1,
            // });
            // const mesh = new Mesh(geometry, material);
            // mesh.position.copy(body.position);
            // mesh.quaternion.copy(body.quaternion);
            // parent.add(mesh);
            // this.landRiser = {mesh, body};

            // // Add a collision event listener to the building's MAIN physics body
            // // this.objectInContact = [];
            // // parent.state.world.addEventListener("beginContact", this.handleContact.bind(this));
            // // parent.state.world.addEventListener("endContact", this.handleDetact.bind(this));
            // body.addEventListener("collide", this.handleContact.bind(this));
        });

        // Add self to parent's update list
        parent.addToUpdateList(this);
    }

    // Convention: When given a gltf scene, the initial children objects ALL represent the land parts. (make sure to not export other stuff)
    // Convention #2: the FIRST child obj (youngest-created) has to represent the overall contour boundary (if too much hustle, then just call the command on every childObj)
    // Goal is to traverse each land part and generate a unique convex collider for it to cover depth etc.
    // But this requires that in the GLTF file, mountains etc should be its own obj on top of the land.
    // AGAIN, DON'T FORGET TO SCALE TO 1! COLLIDER OFF = NOT SCALED TO 1!
    traverseAndInitPieces(parent, childObjs, startingPos, boundaryWallParams, mass, material, collisionFilterGroup, collisionFilterMask, linearDamping, angularDamping, fixedRotation) {
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
            parent.bodyIDToString[body.id] = "Land";
          
            // Add the Cannon.js body to the world
            parent.state.world.addBody(body); 
        }

        /*const submeshes = []; // meshes within this part
        scene.traverse((child) => { // childObj is also included in the traversal. MAYBE???
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
            position: startingPos, // object.position.add(startingPos), either one works
            linearDamping: linearDamping, // most likely 0. Land shouldn't be moving.
            angularDamping: angularDamping, // most likely 0. Land shouldn't be moving.
            fixedRotation: fixedRotation, // most likely true. Land shouldn't be moving.
            collisionFilterGroup: collisionFilterGroup,
            collisionFilterMask: collisionFilterMask,
        });
        body.updateMassProperties(); // Need to call this after setting up the parameters.
        parent.bodyIDToString[body.id] = "Land";

        // createVisualFromCannonBody(parent, shape, body, { color: 0xff0000, wireframe: true });
      
        // Add the Cannon.js body to the world
        parent.state.world.addBody(body); */

        // Spawn in the tile contour boundary collider. CONVENTION: first child obj (Can twerk to check all childObj). Also wall thickness of 0.1 is enough.
        createWallCollidersAndVisualize(childObjs[0], boundaryWallParams.wallHeight, parent, boundaryWallParams.wallTurnOffIndexList, 
          0.1, boundaryWallParams.isVisible); // FOR TESTING ONLY
    }

    handleContact(event) { // the function executed when a collision happens between something and the sea floor riser
        /*let { bodyA, bodyB } = event;
        if (this.parentObj.bodyIDToString[bodyA.id] == "SeaLevel" || this.parentObj.bodyIDToString[bodyB.id] == "SeaLevel") 
            this.objectInContact.push(this.parentObj.bodyIDToString[bodyA.id] == "SeaLevel" ? bodyB : bodyA);*/

        let playerBody = null, waterParticleBody = null;
        if (this.parentObj.bodyIDToString[event.contact.bi.id] == "Player") playerBody = event.contact.bi;
        else if (this.parentObj.bodyIDToString[event.contact.bj.id] == "Player") playerBody = event.contact.bj;
        else if (this.parentObj.bodyIDToString[event.contact.bi.id] == "WaterParticle") waterParticleBody = event.contact.bi;
        else if (this.parentObj.bodyIDToString[event.contact.bj.id] == "WaterParticle") waterParticleBody = event.contact.bj;

        if (playerBody != null) { // damage the player (touching seafloor) 
            this.parentObj.player.loseHealth(10);
            playerBody.applyForce(new CANNON.Vec3(randomInclusive(0, 100), 1000, randomInclusive(0, 100)), playerBody.position); // for retriggering
        }

        if (waterParticleBody != null) { // distorts the water a bit
            waterParticleBody.applyForce(new CANNON.Vec3(randomInclusive(0, 100), randomInclusive(150, 250), randomInclusive(0, 100)), waterParticleBody.position);
            if (waterParticleBody.collisionFilterMask == -1) waterParticleBody.collisionFilterMask = 0b101111;
        }
    }

    /*handleDetact(event) {
        let { bodyA, bodyB } = event;
        let index;
        if (this.parentObj.bodyIDToString[bodyA.id] == "SeaLevel")
            index = this.objectInContact.indexOf(bodyB); // get the index of the element
        else if (this.parentObj.bodyIDToString[bodyB.id] == "SeaLevel")
            index = this.objectInContact.indexOf(bodyA); // get the index of the element
        if (index !== -1) 
            this.objectInContact.splice(index, 1); // remove the element at the specified index
            // this.objectInContact.remove(this.parentObj.bodyIDToString[bodyA.id] == "SeaLevel" ? bodyB : bodyA);
    }*/

    update() {
        if (this.landRiser) { // if exists, then rise land from start to end proprotional to current time elapsed.
            let timeRatio = this.parentObj.gameTimer.timeElapsedInSeconds() / this.parentObj.numSecondsToSurvive;
            this.landRiser.body.position.y = this.riserLandY.start + (this.riserLandY.end - this.riserLandY.start) * timeRatio;
            this.landRiser.mesh.position.copy(this.landRiser.body.position);
        }

        /*console.log(this.objectInContact);
        for (let i = 0; i < this.objectInContact.length; i++) {
            let currentBody = this.objectInContact[i];
            if (currentBody) {
                if (currentBody.id == "Player") { // damage the player (touching seafloor)
                    this.parentObj.player.loseHealth(10);
                    // currentBody.applyForce(new CANNON.Vec3(randomInclusive(0, 100), 1000, randomInclusive(0, 100)), playerBody.position); // for retriggering
                }
                else if (currentBody.id == "WaterParticle") { // distorts the water a bit
                    currentBody.applyForce(new CANNON.Vec3(randomInclusive(0, 100), randomInclusive(150, 250), randomInclusive(0, 100)), currentBody.position);
                    if (currentBody.collisionFilterMask == -1) currentBody.collisionFilterMask = 0b101111;
                }
            }           
        }*/
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


class WallCollider {
    constructor(position, quaternion, dimensions, parent) {
        // Initialize your wall collider with the given position, rotation, and dimensions
        const shape = new CANNON.Box(new CANNON.Vec3(dimensions.x / 2, dimensions.y / 2, dimensions.z / 2));
        const body = new CANNON.Body({  // invisible collider properties
            mass: 0,  // static
            shape: shape,
            material: new CANNON.Material({friction: 1, restitution: 1}),
            position: position,
            quaternion: quaternion,
            collisionFilterGroup: 0b00100, // None
            collisionFilterMask: -1, // None
        });
        body.updateMassProperties(); // Need to call this after setting up the parameters.
        this.collider = body;
        parent.bodyIDToString[body.id] = "Wall";

        this.dimensions = dimensions;
        this.position = position;
        this.quaternion = quaternion;
        this.world = parent.state.world;
    }

    addToWorld() {
        this.world.addBody(this.collider);
    }

    removeFromWorld() {
        this.world.removeBody(this.collider);
    }

    enable() {
        this.collider.collisionResponse = true;
    }

    disable() {
        this.collider.collisionResponse = false;
    }
}

// The main function that adds a wall collider to every edge of this convention-following landscape tile.
function createWallCollidersAndVisualize(mesh, height, parentScene, turnOffWallIndexList = [], thickness = 0.1, visualize = false) {
    // Prep all the collider objects
    const wallColliders = createWallColliders(mesh, height, parentScene, thickness);

    // Sort the indices in descending order
    turnOffWallIndexList.sort((a, b) => b - a);
    // Iterate through the turnOffWallIndexList and remove the corresponding walls. This is O(n log n), faster than O(n^2)
    for (const removeWallIndex of turnOffWallIndexList) {
        if (removeWallIndex >= 0 && removeWallIndex < wallColliders.length) { // has error check
            wallColliders.splice(removeWallIndex, 1);
        }
    }

    // Add in the walls on allowed boundaries!
    for (let i = 0; i < wallColliders.length; i++) {
        let collider = wallColliders[i];
        collider.addToWorld(); // physicaly add the collider
        if (visualize) {
            const material = new MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
            const colliderVisual = createColliderVisuals(collider, material);
            parentScene.add(colliderVisual); // visually add the collider
        }
    }
}

// Creates a WallCollider object given the parameters.
function createWallColliders(mesh, height, parentScene, thickness) {
    // 1. Identify the bottom face vertices of the mesh
    // 2. Find the edges of the bottom face
    const edges = extractBottomFaceEdges(mesh); // counter-clockwise traversal of contour.

    // 3. Generate a wall collider for each edge
    const wallColliders = edges.map((edge) => {
        const edgeVector = new Vector3().subVectors(edge[1], edge[0]);
        const edgeLength = edgeVector.length();

        // Calculate the orientation of the box collider
        const edgeDirection = edgeVector.clone().normalize();
        edgeDirection.y = 0; // Project edge direction onto the XZ plane
        const referenceVector = new Vector3(1, 0, 0);
        let angle = referenceVector.angleTo(edgeDirection);
        const crossProduct = new Vector3().crossVectors(referenceVector, edgeDirection);
        const angleSign = crossProduct.y > 0 ? 1 : -1;
        angle *= angleSign;
        const quaternion = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), angle);

        // Compute the offset vector
        const offset = thickness / 2; // so the side aligns
        let offsetVector = new Vector3(edgeDirection.z, 0, -edgeDirection.x).multiplyScalar(offset);
        offsetVector.y += height / 2; // so the bottom aligns

        // Calculate the midpoint of the edge and update the position with the offset
        const midpoint = new Vector3().addVectors(edge[0], edge[1]).multiplyScalar(0.5).add(offsetVector);

        const dimensions = new Vector3(edgeLength, height, thickness);
        const position = new CANNON.Vec3(midpoint.x, midpoint.y, midpoint.z);

        return new WallCollider(position, quaternion, dimensions, parentScene);
    });
  
    return wallColliders;
}

// Showcases a visualization of the current (Box) collider.
function createColliderVisuals(collider, material) {
    // Get collider position and dimensions
    const position = collider.position;
    const dimensions = collider.dimensions;
  
    // Create a BoxGeometry using the dimensions
    const geometry = new BoxGeometry(dimensions.x, dimensions.y, dimensions.z);
  
    // Create a Mesh using the geometry and material
    const mesh = new Mesh(geometry, material);
  
    // Set the mesh position to the collider's position
    mesh.position.set(position.x, position.y, position.z);
  
    // Apply the same rotation as the collider
    mesh.quaternion.copy(collider.quaternion);
  
    return mesh;
}

// Given a geometry or bufferedGeometry mesh, this helper function finds and extracts the vertices that make up the bottom
// of a tiled shape via a simple heuristic: the bottom has to be flat, parallel to XZ plane. So we can extract all vertices that
// are on the same Y axis height as the bottom face (within a threshold for error tolerance).
// CONDITIONS: the bottom must be flat and smooth, and the side edges must be straight.
// Can cut and smooth out the bottom with infusion in Blender. :D.
function extractBottomFaceEdges(mesh, threshold = 0.01) {
    // Get the bounding box
    const bufferGeometry = mesh.geometry; // assume buffered geometry.
    bufferGeometry.computeBoundingBox();
    const boundingBox = bufferGeometry.boundingBox;

    // Retrieves the bottom faces (triangles) of the mesh
    const bottomY = boundingBox.min.y;
    const positionAttribute = bufferGeometry.getAttribute('position');
    const faces = []; // stores a bunch of triangles of coordinates
    if (bufferGeometry.index != null) {  // has index
        const indexAttribute = bufferGeometry.getIndex();
        for (let i = 0; i < indexAttribute.count; i += 3) {
            const face = [
                new Vector3(
                    positionAttribute.getX(indexAttribute.getX(i)),
                    positionAttribute.getY(indexAttribute.getX(i)),
                    positionAttribute.getZ(indexAttribute.getX(i))
                ),
                new Vector3(
                    positionAttribute.getX(indexAttribute.getX(i + 1)),
                    positionAttribute.getY(indexAttribute.getX(i + 1)),
                    positionAttribute.getZ(indexAttribute.getX(i + 1))
                ),
                new Vector3(
                    positionAttribute.getX(indexAttribute.getX(i + 2)),
                    positionAttribute.getY(indexAttribute.getX(i + 2)),
                    positionAttribute.getZ(indexAttribute.getX(i + 2))
                )
            ];
            if (
                Math.abs(face[0].y - bottomY) <= threshold &&
                Math.abs(face[1].y - bottomY) <= threshold &&
                Math.abs(face[2].y - bottomY) <= threshold
            ) {
                faces.push(face);
            }
        }
    }
    else { // no index
        for (let i = 0; i < positionAttribute.count; i += 3) {
            const face = [
                new Vector3(
                    positionAttribute.getX(i),
                    positionAttribute.getY(i),
                    positionAttribute.getZ(i)
                ),
                new Vector3(
                    positionAttribute.getX(i + 1),
                    positionAttribute.getY(i + 1),
                    positionAttribute.getZ(i + 1)
                ),
                new Vector3(
                    positionAttribute.getX(i + 2),
                    positionAttribute.getY(i + 2),
                    positionAttribute.getZ(i + 2)
                )
            ];
            if (
                Math.abs(face[0].y - bottomY) <= threshold &&
                Math.abs(face[1].y - bottomY) <= threshold &&
                Math.abs(face[2].y - bottomY) <= threshold
            ) {
                faces.push(face);
            }
        }
    }

    // Retrieves the contour edges of the main bottom face, in order
    const edges = [];
    for (const triangle of faces) {
        for (let i = 0; i < 3; i++) {
            const vertexA = triangle[i];
            const vertexB = triangle[(i + 1) % 3];

            let isDuplicate = false;
            for (let j = 0; j < edges.length; j++) {
                let edge = edges[j];
                if ((edge[0].equals(vertexA) && edge[1].equals(vertexB)) || (edge[0].equals(vertexB) && edge[1].equals(vertexA))) {
                    // If the edge exists, remove it from the edges array
                    edges.splice(j, 1);
                    isDuplicate = true;
                }
            }
            if (!isDuplicate) {
                edges.push([vertexA, vertexB]);
            }
        }
    }

    return edges;
}


export default Land;
