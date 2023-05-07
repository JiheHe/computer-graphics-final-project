import { Group, Box3, Vector3 } from 'three';
import { Mesh, MeshBasicMaterial, BoxGeometry } from 'three';
// import { Face3, Geometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import qh from 'quickhull3d'
import SKYSCRAPER_MODEL from './skyscraper.gltf'; // import other buildling gltfs here. Make sure to follow the convention!

function createConvexPolyhedronFromGeometry(geometry, parent = null) { // a helper function that creates a cannon.js convex polyhedron for a better-fit collider
  let convexVertices = geometry.vertices;
  const options = { skipTriangulation: true };
  let convexFaces = qh(convexVertices, options); // using QuickHull to create a quick convex hull given the list of vertices without triangulation
  let cannonVertices = convexVertices.map((v) => new CANNON.Vec3(v[0], v[1], v[2])); // convert to required datatype.

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
  return new CANNON.ConvexPolyhedron( {vertices: cannonVertices, faces: convexFaces} ); // constructs the convex polyhedron
}

function extractVerticesAndFacesFromBufferGeometry(bufferGeometry) { // given a loader buffer geometry, outputs the vertices and faces of the mesh following the convention
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

function mergeVerticesAndFaces(submeshes) { // given a list of meshes, merge all their vertices and faces together as if they are one big mesh. For convex hulling.
  let mergedVertices = [];
  let mergedFaces = [];
  let vertexOffset = 0;

  for (const submesh of submeshes) {
    const info = extractVerticesAndFacesFromBufferGeometry(submesh.geometry); // extract the verts and faces from the current mesh

    // Add vertices
    mergedVertices.push(...info.vertices);

    // Add faces and update indices
    const updatedFaces = info.faces.map(face => {
      return face.map(index => index + vertexOffset);
    });
    mergedFaces.push(...updatedFaces);

    vertexOffset += info.vertices.length;
  }

  return { vertices: mergedVertices, faces: mergedFaces }; // one big list.
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

    if (modelUrl) { // if a model is supplied
      // Load object
      const loader = new GLTFLoader();
      loader.load(modelUrl, (gltf) => {
        // Cache each fractured piece in the file, following the convention
        this.traverseAndDefinePieces(gltf.scene.children, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask);
        // Add the main piece (0th 'earliest' piece, following the convention) to the scene.
        // const dimensions = this.calculateModelDimensions(gltf.scene.children[0]); // just a bounding box dim, not as accurate but prob faster. Put dim back if too slow.
        this.initPhysics(parent, null, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask);
        this.originalObj = gltf.scene.children[0]; // need to put it before the add, otherwise the address points to other stuff since:
        this.add(gltf.scene.children[0]); // changes the hierarchy of the first child by moving it under the custom script; visualizes it
        this.fractured = false; // starts off intact

        // Add a collision event listener to the building's MAIN physics body
        this.body.addEventListener("collide", this.handleCollision.bind(this));
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

  // SIMPLIFICATION: When given a gltf scene, the initial children objects ALL represent the buildling parts.
  // within each object, we account for their collectivity by finding all the meshes in it and visualize/physicalize them as one
  // O(n). Much faster and easier.
  // Input: gltf.scene.children, a list of objects.
  // CONVENTION: if there are >1 children, then first child will ALWAYS be the full mesh, and the rest will be the fractured parts.
  // Otherwise, if there is only 1 child, then that child is the full mesh. (no fractured part). TODO: this part is not implemented yet, no need I think?
  traverseAndDefinePieces(childObjs, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask) {
    // Define the main piece (keeps track of all the meshes in the OG building)
    this.mainmeshes = [];
    childObjs[0].traverse((child) => { 
      if (child.isMesh) {
        this.mainmeshes.push(child);
      }
    });
    // Define the fractured pieces via caching
    for (let i = 1; i < childObjs.length; i++) {
      let childObj = childObjs[i]; // current piece.
      const submeshes = []; // meshes within this piece
      childObj.traverse((child) => { // childObj is also included in the traversal. MAYBE???
        if (child.isMesh) {
          submeshes.push(child);
        }
      });
      this.state.fracturedPieces.push(
        {childObj, submeshes, startingPos, mass: 0, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask} ); // temporary cache
    }
  }

  initPhysics(parent, dimensions, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask) {
    if (dimensions != null) this.shape = new CANNON.Box(new CANNON.Vec3(dimensions.x / 2, dimensions.y / 2, dimensions.z / 2)); // generating a box collider
    else {
      const info = mergeVerticesAndFaces(this.mainmeshes);
      this.shape = createConvexPolyhedronFromGeometry(info); // generating a convex-hulled, shape-specific collider
    }

    this.body = new CANNON.Body({ // parameter definitions defined at the bottom of this script
      mass: 0, // mass input parameter. Set it to 0 because a building shouldn't be moving anyway.
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

    // For calculating indiv part mass % based on volume.
    this.mainMass = mass;
    this.mainVolume = this.shape.volume();
    this.totalVolume = 0;

    // Add body to the world (physics world)
    parent.state.world.addBody(this.body);

    // Update Three.js object position to match Cannon.js body position (Two different systems)
    this.position.copy(this.body.position);
    this.position.add(this.state.colliderOffset);
    this.quaternion.copy(this.body.quaternion);
  }

  calculateShapeAndVolume(submeshes) { // Given a set of submeshes, create a convex polyhedron shape and return its shape and volume
    const info = mergeVerticesAndFaces(submeshes);
    const shape = createConvexPolyhedronFromGeometry(info); // object is of type "BufferedGeometry" // generating a convex-hulled, shape-specific collider
    let volume = shape.volume();
    this.totalVolume += volume;
    return { shape, volume };
  }

  initPhysicsForFracturedPiece(parent, object, shape, volume, index, startingPos, additionalMass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask) {
    /*// Calculate the dimensions of the object
    const box = new Box3().setFromObject(object);
    const size = new Vector3();
    box.getSize(size);
    // Create a Cannon.js body for the object
    const shape = new CANNON.Box(new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2));*/ // we use a more precise shape definition now.
    let avgVolume = (this.mainVolume + this.totalVolume) / 2.0;
    let volumeRatio = volume / avgVolume;
    let newMass = volumeRatio * this.mainMass + additionalMass; // weighted by volume, part of main mesh so portion of the mass, plus additional mass for tuning

    const body = new CANNON.Body({
      mass: newMass, // the weighted mass.
      shape: shape,
      material: new CANNON.Material({
        friction: friction,
        restitution: restitution,
      }),
      position: new Vector3().copy(object.position).add(startingPos), // object.position.add(startingPos), either one works
      linearDamping: linearDamping,
      angularDamping: angularDamping,
      fixedRotation: fixedRotation,
      collisionFilterGroup: collisionFilterGroup,
      collisionFilterMask: collisionFilterMask,
    });
    body.updateMassProperties();

    // Add the Cannon.js body to the world
    parent.state.world.addBody(body); // Need to call this after setting up the parameters.

    // Set the body to sleep initially, so it doesn't simulate until a collision happens
    // body.sleep();

    // Store the Cannon.js body and the Three.js object for future updates.
    this.state.fracturedPieces[index] = { body, object };
  }

  handleCollision(event) { // the function executed when a collision happens between something and the main physical buildling.
    // Get the impact velocity along the normal
    const impactVelocityAlongNormal = event.contact.getImpactVelocityAlongNormal();
  
    // Calculate the impact force along the normal by multiplying the impact velocity along the normal by the mass of the colliding body
    // assumes the collision is perfectly elastic. In reality, might need to take into account the coefficient of restitution 
    const impactForce = Math.abs(impactVelocityAlongNormal * event.contact.bj.mass);
  
    // If the impact force is above the threshold, break the building
    if (impactForce > this.state.breakThreshold) {
      // console.log("Collision happened");
      this.fractured = true;
    }
  }

  breakBuilding(parent) {
    // Wake up and enable simulation for the fractured pieces
    // for (const piece of this.state.fracturedPieces) {
    //  piece.body.wakeUp();
    // }

    // Spawn the fractured pieces
    let shapeAndVolumeCache = [];
    for (let i = 0; i < this.state.fracturedPieces.length; i++) {
      // Calculate and the shape and cumulative volume info for each piece
      let info = this.state.fracturedPieces[i];
      shapeAndVolumeCache[i] = this.calculateShapeAndVolume(info.submeshes);
    }
    for (let i = 0; i < this.state.fracturedPieces.length; i++) {
      // Initialize physics for the fractured piece
      let info = this.state.fracturedPieces[i];
      this.initPhysicsForFracturedPiece(parent, info.childObj, shapeAndVolumeCache[i].shape, shapeAndVolumeCache[i].volume, i, info.startingPos, info.mass, info.friction, info.restitution, 
        info.linearDamping, info.angularDamping, info.fixedRotation, info.collisionFilterGroup, info.collisionFilterMask);
      // Initialize visuals
      parent.add(info.childObj); // why parent.add instead of this.add?
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
      else { // updated fractured pieces visual to match physical
        for (const piece of this.state.fracturedPieces) {
          piece.object.position.copy(piece.body.position);
          piece.object.quaternion.copy(piece.body.quaternion);
        }
      }

    }

    // Update Three.js object position to match Cannon.js body position (Two different systems)
    if (this.body) { // exists only if main body is there
      this.position.copy(this.body.position);
      this.position.add(this.state.colliderOffset);
      this.quaternion.copy(this.body.quaternion);
    }

    if (this.mesh) { // doesn't exist, unless in visualization mode creation.
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

class Skyscraper extends Building { // An example of how to make a building type
  constructor(parent, useModel, startingPos, dimensions = (new Vector3(2, 10, 2)).multiplyScalar(2), mass = 10, friction = 1, restitution = 0,
    linearDamping = 0.9, angularDamping = 0.9, fixedRotation = false, collisionFilterGroup = -1, collisionFilterMask = -1) {
    super(parent, "skyscraper", useModel ? SKYSCRAPER_MODEL : null, dimensions, startingPos, mass, friction, restitution, 
      linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask);
  }
}

export { Skyscraper }; // using named exports, don't forget to update index.js as well.
