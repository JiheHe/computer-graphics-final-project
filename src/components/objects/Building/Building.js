import { Group, Box3, Vector3, Face3 } from 'three';
import { Mesh, MeshBasicMaterial, BoxGeometry, Geometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import SKYSCRAPER_MODEL from './skyscraper.gltf';
import qh from 'quickhull3d'

function createConvexPolyhedronFromGeometry(geometry) {
  let convexVertices = geometry.vertices;
  const options = { skipTriangulation: true };
  let convexFaces = qh(convexVertices, options);
  let cannonVertices = convexVertices.map((v) => new CANNON.Vec3(v[0], v[1], v[2]));

  // this part is to visualize, debugging only // the convex hull looks good!
  /*const convexGeometry = new Geometry();
  convexGeometry.vertices = convexVertices.map((v) => new Vector3(v[0], v[1], v[2]));
  convexFaces.forEach((face) => {
    // Assuming the face is a triangle
    convexGeometry.faces.push(new Face3(face[0], face[1], face[2]));
  });
  convexGeometry.computeFaceNormals();
  convexGeometry.computeVertexNormals();
  const material = new MeshBasicMaterial({ color: 0xffff00, wireframe: false });
  const mesh = new Mesh(convexGeometry, material);
  parent.add(mesh);*/

  // CRINGE TOOK ME 7 HOURS ON SYNTAX BUG: {cannonVertices, convexFaces} is actually interpreted as {cannonVertices: cannonVertices, convexFaces: convexFaces}. 
  // So, the property names in the object you pass to the constructor don't match the expected vertices and faces properties.
  return new CANNON.ConvexPolyhedron( {vertices: cannonVertices, faces: convexFaces} );
}

function extractVerticesAndFacesFromBufferGeometry(bufferGeometry) {
  // Extract the vertices first, basically the same as geometry.attributes.position.
  const vertices = []; 
  const positionAttribute = bufferGeometry.getAttribute('position');
  for (let i = 0; i < positionAttribute.count; i++) {
    const vertex = [
      positionAttribute.getX(i),
      positionAttribute.getY(i),
      positionAttribute.getZ(i)
    ];
    vertices.push(vertex);
  }
  // Extract the faces next. If the geometry has no index, then a face defined by three consequent vertices, otherwise, by three consequent indices of vertices in index.
  const faces = []; // stores the indices of every face, an array of arrays.
  if (bufferGeometry.index != null) {  // has index
    const indexAttribute = bufferGeometry.getIndex();
    for (let i = 0; i < indexAttribute.count; i += 3) {
      const face = [
        indexAttribute.getX(i),
        indexAttribute.getX(i+1),
        indexAttribute.getX(i+2),
      ];
      faces.push(face);
    }
  }
  else { // no index
    for (let i = 0; i < positionAttribute.count; i += 3) {
      const face = [
        i,
        i+1,
        i+2
      ];
      faces.push(face);
    }
  }
  return { vertices, faces };
}

class Building extends Group {
  constructor(parent, name, modelUrl = null, dims = null, startingPos, mass, friction, restitution, 
    linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask) { // dims is a vec3
    // Call parent Group() constructor
    super();

    // Init state, variable specific to this object. (TODO: tune them later)
    this.state = {
      colliderOffset: new Vector3(0, 0, 0), // manually tuning the offset needed for mesh visualization to match the physical collider
      breakThreshold: 100, // Set the force threshold for breaking the building
      fracturedPieces: [], // Store fractured pieces' physics bodies and objects
    }

    this.name = name;
    this.parentObj = parent;

    if (modelUrl) {
      // Load object
      const loader = new GLTFLoader();
      loader.load(modelUrl, (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            this.state.fracturedPieces.push(
              {child, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask} ); // temporary cache
          }
        });

        // Add the main piece to the scene.
        const dimensions = this.calculateModelDimensions(gltf.scene);
        this.initPhysics(parent, dimensions, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask);
        this.add(gltf.scene);
        this.originalObj = gltf.scene;
        this.fractured = false;

        // Add a collision event listener to the building's physics body
        this.body.addEventListener("collide", this.handleCollision.bind(this)); // this.body.addEventListener("collide", (event) => {this.handleCollision(event)});
      });
    } else {
      this.initPhysics(parent, dims, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask);

      // visualizing the custom shape
      const geometry = new BoxGeometry(dims.x, dims.y, dims.z);
      const material = new MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.5,
      });
      this.mesh = new Mesh(geometry, material);
      this.mesh.position.copy(this.body.position);
      parent.add(this.mesh); // Add mesh to Building instance // "this.add" is better for encapsulation, but could have coord offset
    }

    // Add self to parent's update list
    parent.addToUpdateList(this);
  }
  
  calculateModelDimensions(model) { // get the bounding box of the moel
    const box = new Box3().setFromObject(model);
    const size = new Vector3();
    box.getSize(size);

    return size;
  }

  initPhysics(parent, dimensions, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask) {
    this.shape = new CANNON.Box(new CANNON.Vec3(dimensions.x / 2, dimensions.y / 2, dimensions.z / 2));
    this.body = new CANNON.Body({
      mass: mass,
      shape: this.shape,
      material: new CANNON.Material({
        friction: friction,
        restitution: restitution,
      }),
      position: startingPos,
      linearDamping: linearDamping,
      angularDamping: angularDamping,
      fixedRotation: fixedRotation,
      collisionFilterGroup: collisionFilterGroup,
      collisionFilterMask: collisionFilterMask,
    });
    this.body.updateMassProperties(); // Need to call this after setting up the parameters.

    // Add body to the world (physics world)
    parent.state.world.addBody(this.body);

    // Update Three.js object position to match Cannon.js body position (Two different systems)
    this.position.copy(this.body.position);
    this.position.add(this.state.colliderOffset);
    this.quaternion.copy(this.body.quaternion);
  }

  initPhysicsForFracturedPiece(parent, object, index, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask) {
    /*// Calculate the dimensions of the object
    const box = new Box3().setFromObject(object);
    const size = new Vector3();
    box.getSize(size);
    // Create a Cannon.js body for the object
    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));*/
    const info = extractVerticesAndFacesFromBufferGeometry(object.geometry);
    const shape = createConvexPolyhedronFromGeometry(info); // object is of type "BufferedGeometry"
    // console.log(shape);

    const body = new CANNON.Body({
      mass: mass,
      shape: shape,
      material: new CANNON.Material({
        friction: friction,
        restitution: restitution,
      }),
      position: object.position.add(startingPos),
      linearDamping: linearDamping,
      angularDamping: angularDamping,
      fixedRotation: fixedRotation,
      collisionFilterGroup: collisionFilterGroup,
      collisionFilterMask: collisionFilterMask,
    });

    // Add the Cannon.js body to the world
    parent.state.world.addBody(body);

    // Set the body to sleep initially, so it doesn't simulate until a collision happens
    // body.sleep();

    // Store the Cannon.js body and the Three.js object for future updates
    this.state.fracturedPieces[index] = { body, object };
  }

  handleCollision(event) {
    // Get the impact velocity along the normal
    const impactVelocityAlongNormal = event.contact.getImpactVelocityAlongNormal();
  
    // Calculate the impact force along the normal by multiplying the impact velocity along the normal by the mass of the colliding body
    // assumes the collision is perfectly elastic. In reality, you might need to take into account the coefficient of restitution 
    const impactForce = Math.abs(impactVelocityAlongNormal * event.contact.bj.mass);
  
    // If the impact force is above the threshold, break the building
    if (impactForce > this.state.breakThreshold) {
      console.log("Collision happened");
      this.fractured = true;
    }
  }

  breakBuilding(parent) {
    // Remove the unbroken building physics body from the world

    // Wake up and enable simulation for the fractured pieces
    // for (const piece of this.state.fracturedPieces) {
    //  piece.body.wakeUp();
    // }

    // Spawn the fractured pieces
    for (let i = 0; i < this.state.fracturedPieces.length; i++) {
      // Initialize physics for the fractured piece
      let info = this.state.fracturedPieces[i];
      this.initPhysicsForFracturedPiece(parent, info.child, i, info.startingPos, info.mass, info.friction, info.restitution, 
        info.linearDamping, info.angularDamping, info.fixedRotation, info.collisionFilterGroup, info.collisionFilterMask);
      // Initialize visuals
      parent.add(info.child.parent); // why parent.add instead of this.add?
      // Overwrite has happened
      let piece = this.state.fracturedPieces[i];
      piece.object.position.copy(piece.body.position);
      piece.object.quaternion.copy(piece.body.quaternion);
    }
  }

  update() {
    if (this.fractured) {
      if (!this.originalDeleted) {
        // Remove the original (unshattered) building. Putting it here because need to wait till previous update is finished else physical update might error
        this.parentObj.state.world.removeBody(this.body); 
        this.remove(this.originalObj);
        // Spawn the new shattered pieces
        this.breakBuilding(this.parentObj);
        this.originalDeleted = true;
      }
      else {
        for (const piece of this.state.fracturedPieces) {
          piece.object.position.copy(piece.body.position);
          piece.object.quaternion.copy(piece.body.quaternion);
        }
      }

    }

    // Update Three.js object position to match Cannon.js body position (Two different systems)
    if (this.body) {
      this.position.copy(this.body.position);
      this.position.add(this.state.colliderOffset);
      this.quaternion.copy(this.body.quaternion);
    }

    if (this.mesh) {
      this.mesh.position.copy(this.body.position);
      this.mesh.position.add(this.state.colliderOffset);
      this.mesh.quaternion.copy(this.body.quaternion);
    }
  }
}


// Children classes below are variations of parent class.
// Default parameters are used for artistic visualization of building looks and placements
// Want to use an actual polished modelUrl model in official release.

// param: parent, modelUrl = null, dims = null, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask, name
// model url - path to the gltf file. Use useModel to decide whether to use model or not.
// dims - vector3 object stating the size dim of the shape (obselete in the presence of a model url, used for quick visualization to help modeling)
// startingPos - Cannon.Vec3 object stating the starting position of the shape
// mass - mass of the object (how heavy). 0 = static and immovable, large and heavy structures typically have high mass value
// friction - how much object slides. For buildings, generally a value between 0.6 to 1.0
// restitution - how much object bounces on contact. For buildings, generally a value between 0.0 to 0.2
// linearDamping - the rate at which the object loses linear velocity due to "air" resistance. For buildings, generally a value between 0.9 to 1.0
// angularDamping - the rate at which the object loses angular velocity. For buildings, generally a value between 0.9 to 1.0
// fixedRotation - should the building rotate due to external forces? Yes or No
// collisionFilterGroup - assigns an object to a specific group, usually done with bits (i.e. each bit mask is a diff group) // TODO: should probably add this property to other objects
// collisionFilterMask - a property that defines which groups an object should collide with, bitwise OR of the groups. -1 means NONE by default.

class Skyscraper extends Building {
  constructor(parent, useModel, startingPos, dimensions = new Vector3(2, 10, 2), mass = 10, friction = 1, restitution = 0,
    linearDamping = 0.9, angularDamping = 0.9, fixedRotation = false, collisionFilterGroup = -1, collisionFilterMask = -1) {
    super(parent, "skyscraper", useModel ? SKYSCRAPER_MODEL : null, dimensions, startingPos, mass, friction, restitution, 
      linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask);
  }
}

export { Skyscraper }; // using named exports, don't forget to update index.js as well.
