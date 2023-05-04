import { Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import MODEL from './player.gltf';

// IMPORTANT: the player movement is fully simulated by Cannon.JS's physics engine, NOT using TWEEN. 

class Player extends Group {
    constructor(parent) {
        // Call parent Group() constructor
        super();

        // Init state, variable specific to this object. (TODO: tune them later)
        this.state = {
            gui: parent.state.gui, // gui, useless at the moment. Can be used in the future for parameter tuning, or delete.
            moveSpeed: 5, // move speed of the player
            jumpHeight: 1, // jump height of the player
        };

        // Load object
        const loader = new GLTFLoader();

        this.name = 'player';
            loader.load(MODEL, (gltf) => {
            this.add(gltf.scene);
        });

        // Initialize physical properties of the object
        this.initPhysics(parent);

        // Add self to parent's update list
        parent.addToUpdateList(this);
    }

    initPhysics(parent) { // Initialize physical properties of the object (TODO: tune them later)
        // Set up Cannon.js physics
        this.body = new CANNON.Body({
            mass: 1, // The mass of the object
            shape: new CANNON.Cylinder(0.5, 0.5, 2, 16), // The shape of the object's collision volume
            material: new CANNON.Material( // The material properties of the object
                { friction: 0.5, // how much object slides
                restitution: 0 }), // how much object bounces on contact
            linearDamping: 0.8, // A factor that reduces the object's linear velocity over time, simulating friction or air resistence.
            fixedRotation: true, // When true, disables forced rotation due to collision
            position: new CANNON.Vec3(0, 1, 0), // The starting position of the object in the physics world.
        });
        this.body.updateMassProperties(); // Need to call this after setting up the parameters.

        // Add body to the world (physics world)
        parent.state.world.addBody(this.body);
    }

    getCameraVectors(camera) { // Returns the camera vectors via some linear algebra 
        const cameraForward = new Vector3(); // A vector pointing in the direction the camera is looking. 
        const cameraRight = new Vector3(); // A vector pointing to the right of the camera
    
        camera.getWorldDirection(cameraForward).normalize();
        cameraRight.crossVectors(camera.up, cameraForward).normalize();
    
        return { cameraForward, cameraRight };
    }

    // Dynamic movement. Don't use Twin, let the physics engine handle it
    move(direction, cameraVectors) { // Moves the character parallel to XZ plane based on camera direction via forces.
        const moveForce = this.state.moveSpeed * this.body.mass;
        const { cameraForward, cameraRight } = cameraVectors;
      
        // Set the Y components of the camera vectors to 0 so the movement is parallel to XZ plane
        cameraForward.y = 0;
        cameraRight.y = 0;
      
        // Normalize the camera vectors
        cameraForward.normalize();
        cameraRight.normalize();
      
        let force = new CANNON.Vec3();
      
        switch (direction) { // based on input, apply the forces to move in the corresponding direction. (TODO: add arrow keys as well?)
          case 'D':
            force = new CANNON.Vec3(-cameraRight.x * moveForce, -cameraRight.y * moveForce, -cameraRight.z * moveForce);
            break;
          case 'A':
            force = new CANNON.Vec3(cameraRight.x * moveForce, cameraRight.y * moveForce, cameraRight.z * moveForce);
            break;
          case 'S':
            force = new CANNON.Vec3(-cameraForward.x * moveForce, -cameraForward.y * moveForce, -cameraForward.z * moveForce);
            break;
          case 'W':
            force = new CANNON.Vec3(cameraForward.x * moveForce, cameraForward.y * moveForce, cameraForward.z * moveForce);
            break;
          default:
            break;
        }
      
        if (force.length() > 0) {
          this.body.applyForce(force, this.body.position);
        }

        // Set the object's rotation based on the current velocity direction
        const velocity = this.body.velocity;
        if (velocity.length() > 0) {
            const angle = Math.atan2(velocity.x, velocity.z) + Math.PI; // + Math.PI flips the object's orientation towards the camera. Remove if flipped.
            this.rotation.y = angle;
        }
    }

    jump() { // Makes the character jump parallel to Y axis via forces (what's cool is the forces in different directions are all accounted for by the engine)
        const jumpForce = this.state.jumpHeight;

        // Apply an impulse in the Y direction
        this.body.applyImpulse(new CANNON.Vec3(0, jumpForce, 0), this.body.position);
    }

    update(camera) {
        // Read user input and move accordingly
        const keys = this.parent.state.keys;
        const cameraVectors = this.getCameraVectors(camera);

        for (const key in keys) {
            if (keys[key]) { // if an input is spotted at that key
                this.move(key, cameraVectors);
            }
        }

        if (keys[' ']) { // putting it out reduces the check count.
            this.jump();
        }

        // Update Three.js object position to match Cannon.js body position (Two different systems)
        this.position.copy(this.body.position);

        // Advance tween animations, if any exist
        // TWEEN.update(); // Just gonna keep it here as a reminder, in case needed for character animation
    }
}

export default Player;
