import { Group, Box3, Vector3 } from 'three';
import { Mesh, MeshBasicMaterial, BoxGeometry } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import SKYSCRAPER_MODEL from './skyscraper.gltf';

class Building extends Group {
  constructor(parent, name, modelUrl = null, dims = null, startingPos, mass, friction, restitution, 
    linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask) { // dims is a vec3
    // Call parent Group() constructor
    super();

    // Init state, variable specific to this object. (TODO: tune them later)
    this.state = {
      colliderOffset: new Vector3(0, 0, 0), // manually tuning the offset needed for mesh visualization to match the physical collider
    }

    this.name = name;
    if (modelUrl) {
      // Load object
      const loader = new GLTFLoader();
      loader.load(modelUrl, (gltf) => {
        this.add(gltf.scene); // Add loaded mesh to Building instance
        const dimensions = this.calculateModelDimensions(gltf.scene);
        this.initPhysics(parent, dimensions, startingPos, mass, friction, restitution, linearDamping, angularDamping, fixedRotation, collisionFilterGroup, collisionFilterMask);
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

  update() {
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
