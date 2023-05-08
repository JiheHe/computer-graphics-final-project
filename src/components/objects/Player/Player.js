import { Group, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as CANNON from 'cannon-es';
import MODEL from './player.gltf';

import { CylinderGeometry, MeshBasicMaterial, Mesh, DoubleSide } from 'three';

function createCylinderColliderMesh(playerBody) { // A helper function for visualizing a cylindrical collider
    const cylinderShape = playerBody.shapes[0];
    const geometry = new CylinderGeometry(
        cylinderShape.radiusTop,
        cylinderShape.radiusBottom,
        cylinderShape.height,
        cylinderShape.numSegments
    );

    const material = new MeshBasicMaterial({
        color: 0x0000ff,
        transparent: false,
        opacity: 0.5,
        // side: DoubleSide,
    });

    const mesh = new Mesh(geometry, material);
    mesh.position.copy(playerBody.position);
    mesh.quaternion.copy(playerBody.quaternion);

    return mesh;
}

// IMPORTANT: the player movement is fully simulated by Cannon.JS's physics engine, NOT using TWEEN. 

class Player extends Group {
    constructor(parent, startingPos, material) {
        // Call parent Group() constructor
        super();

        // Init state, variable specific to this object. (TODO: tune them later)
        this.state = {
            gui: parent.state.gui, // gui, useless at the moment. Can be used in the future for parameter tuning, or delete.
            moveSpeed: 5, // move speed of the player // force: 10
            jumpHeight: 2, // jump height of the player // force: 500
            isGrounded: false, // checks whether the character is on the ground.
            colliderOffset: new Vector3(0, 0, 0), // manually tuning the offset needed for mesh visualization to match the physical collider
        };

        // Load object
        const loader = new GLTFLoader();

        this.name = 'player';
        loader.load(MODEL, (gltf) => {
            this.add(gltf.scene);
        });

        // Variables for kinematic movement and QoL updates
        this.targetRotation = 0;
        this.keyReleased = false;
        this.lastDirection = '';

        // Initialize physical properties of the object
        this.initPhysics(parent, startingPos, material);

        // Update Three.js object position to match Cannon.js body position (Two different systems)
        this.position.copy(this.body.position);
        this.position.add(this.state.colliderOffset);

        // Add self to parent's update list
        parent.addToUpdateList(this);
    }

    initPhysics(parent, startingPos, material) { // Initialize physical properties of the object (TODO: tune them later)
        // Set up Cannon.js physics
        this.body = new CANNON.Body({
            mass: 70, // The mass of the object in kg, this is the mass of standard human male
            shape: new CANNON.Cylinder(0.5, 0.5, 2, 16), // The shape of the object's collision volume
            material: material,
            linearDamping: 0.1, // might be useless since kinematics now... // A factor that reduces the object's linear velocity over time, simulating friction or air resistence. 
            fixedRotation: true, // When true, disables forced rotation due to collision
            position: startingPos, // The starting position of the object in the physics world.
        });
        this.body.updateMassProperties(); // Need to call this after setting up the parameters.
        
        this.body.addEventListener('collide', (event) => { // subscribe to "onCollision" event // TODO: type classification later.
            // Check if the collision normal is pointing upwards (character is on the ground)
            if (event.contact.ni.y > 0.5) {
                this.state.isGrounded = true;
            }
        });

        // Add body to the world (physics world)
        parent.state.world.addBody(this.body);

        // for debugging: visualizing collider
        /*this.colliderMesh = createCylinderColliderMesh(this.body);
        this.colliderMesh.position.copy(this.body.position);
        parent.add(this.colliderMesh);*/
    }

    getCameraVectors(camera) { // Returns the camera vectors via some linear algebra 
        const cameraForward = new Vector3(); // A vector pointing in the direction the camera is looking. 
        const cameraRight = new Vector3(); // A vector pointing to the right of the camera
    
        camera.getWorldDirection(cameraForward).normalize();
        cameraRight.crossVectors(camera.up, cameraForward).normalize();
    
        return { cameraForward, cameraRight };
    }

    // ARCHIVED DYNAMIC MOVEMENT CODE via force application. Please collapse.
    /*
    // Dynamic movement. Don't use Twin, let the physics engine handle it
    move(direction, cameraVectors) { // Moves the character parallel to XZ plane based on camera direction via forces.
        const moveForce = this.state.moveSpeed * this.body.mass;
        // const moveSpeed = this.state.moveSpeed;
        const { cameraForward, cameraRight } = cameraVectors;
      
        // Set the Y components of the camera vectors to 0 so the movement is parallel to XZ plane
        cameraForward.y = 0;
        cameraRight.y = 0;
      
        // Normalize the camera vectors
        cameraForward.normalize();
        cameraRight.normalize();
      
        let force = new CANNON.Vec3();
        // let velocity = new CANNON.Vec3();
      
        switch (direction) { // based on input, apply the forces to move in the corresponding direction. (TODO: add arrow keys as well?)
          case 'D':
            force = new CANNON.Vec3(-cameraRight.x * moveForce, -cameraRight.y * moveForce, -cameraRight.z * moveForce);
            // velocity = new CANNON.Vec3(-cameraRight.x * moveSpeed, this.body.velocity.y, -cameraRight.z * moveSpeed);
            break;
          case 'A':
            force = new CANNON.Vec3(cameraRight.x * moveForce, cameraRight.y * moveForce, cameraRight.z * moveForce);
            // velocity = new CANNON.Vec3(cameraRight.x * moveSpeed, this.body.velocity.y, cameraRight.z * moveSpeed);
            break;
          case 'S':
            force = new CANNON.Vec3(-cameraForward.x * moveForce, -cameraForward.y * moveForce, -cameraForward.z * moveForce);
            // velocity = new CANNON.Vec3(-cameraForward.x * moveSpeed, this.body.velocity.y, -cameraForward.z * moveSpeed);
            break;
          case 'W':
            force = new CANNON.Vec3(cameraForward.x * moveForce, cameraForward.y * moveForce, cameraForward.z * moveForce);
            // velocity = new CANNON.Vec3(cameraForward.x * moveSpeed, this.body.velocity.y, cameraForward.z * moveSpeed);
            break;
          default:
            break;
        }
      
        if (force.length() > 0) this.body.applyForce(force, this.body.position);
        // if (velocity.length() > 0) this.body.velocity.copy(velocity);

        // Set the object's rotation based on the current velocity direction
        const velocity = this.body.velocity;
        console.log(velocity)
        if (velocity.length() > 0) {
            const angle = Math.atan2(velocity.x, velocity.z) + Math.PI; // + Math.PI flips the object's orientation towards the camera. Remove if flipped.
            this.rotation.y = angle;
        }
    }

    move(direction, cameraVectors) {
        const moveSpeed = this.state.moveSpeed;
        const { cameraForward, cameraRight } = cameraVectors;
    
        cameraForward.y = 0;
        cameraRight.y = 0;
    
        cameraForward.normalize();
        cameraRight.normalize();
    
        let desiredVelocity = new CANNON.Vec3();
    
        switch (direction) {
            case 'D':
                desiredVelocity = new CANNON.Vec3(-cameraRight.x * moveSpeed, this.body.velocity.y, -cameraRight.z * moveSpeed);
                break;
            case 'A':
                desiredVelocity = new CANNON.Vec3(cameraRight.x * moveSpeed, this.body.velocity.y, cameraRight.z * moveSpeed);
                break;
            case 'S':
                desiredVelocity = new CANNON.Vec3(-cameraForward.x * moveSpeed, this.body.velocity.y, -cameraForward.z * moveSpeed);
                break;
            case 'W':
                desiredVelocity = new CANNON.Vec3(cameraForward.x * moveSpeed, this.body.velocity.y, cameraForward.z * moveSpeed);
                break;
            default:
                break;
        }
    
        let velocityDiff = new CANNON.Vec3(desiredVelocity.x - this.body.velocity.x, desiredVelocity.y - this.body.velocity.y, desiredVelocity.z - this.body.velocity.z);
        velocityDiff.scale(2, velocityDiff);
        const requiredForce = this.body.mass;
    
        let force = new CANNON.Vec3(velocityDiff.x * requiredForce, velocityDiff.y * requiredForce, velocityDiff.z * requiredForce);
    
        if (force.length() > 0) this.body.applyForce(force, this.body.position);
    
        const velocity = this.body.velocity;
        console.log(velocity)
        if (velocity.length() > 0) {
            const angle = Math.atan2(velocity.x, velocity.z) + Math.PI;
            this.rotation.y = angle;
        }
    }*/
    
    // Kinematic movement. Don't use Twin, sorta working with physics engine
    move(direction, cameraVectors) {
        const moveSpeed = this.state.moveSpeed;
        const turnSpeed = 0.2; // Adjust this value to control the smoothness of the turn. // TUNABLE, the smaller the smoother
        const { cameraForward, cameraRight } = cameraVectors;
    
        // Set the Y components of the camera vectors to 0 so the movement is parallel to XZ plane
        cameraForward.y = 0;
        cameraRight.y = 0;
    
        // Normalize the camera vectors
        cameraForward.normalize();
        cameraRight.normalize();
    
        // Initialize the target velocity to 0, not the current velocity else it runs forever
        let targetVelocity = new CANNON.Vec3();
    
        if (direction.includes('D')) {
            targetVelocity.x -= cameraRight.x * moveSpeed;
            targetVelocity.z -= cameraRight.z * moveSpeed;
        }
        if (direction.includes('A')) {
            targetVelocity.x += cameraRight.x * moveSpeed;
            targetVelocity.z += cameraRight.z * moveSpeed;
        }
        if (direction.includes('S')) {
            targetVelocity.x -= cameraForward.x * moveSpeed;
            targetVelocity.z -= cameraForward.z * moveSpeed;
        }
        if (direction.includes('W')) {
            targetVelocity.x += cameraForward.x * moveSpeed;
            targetVelocity.z += cameraForward.z * moveSpeed;
        }
    
        // Normalize the resulting velocity vector to avoid faster diagonal movement
        if (targetVelocity.length() > 0) {
            targetVelocity.normalize();
            targetVelocity.scale(moveSpeed, targetVelocity);
        }

        // Preserve the current Y velocity
        targetVelocity.y = this.body.velocity.y;

        // this.body.velocity = targetVelocity;
        // Linearly interpolate the velocity for smooth turning
        let smoothVelocity = new CANNON.Vec3();
        this.body.velocity.lerp(targetVelocity, turnSpeed, smoothVelocity);
        this.body.velocity = smoothVelocity;

        // Update the flag if a key was released
        if (this.lastDirection.length > direction.length) {
            this.keyReleased = true;
            this.lastKeyReleaseTime = Date.now();
        }

        // Update the last direction
        this.lastDirection = direction;

        // Calculate the time since the last key release
        const timeSinceLastKeyRelease = (Date.now() - this.lastKeyReleaseTime) / 1000;

        // Define a threshold for the time since the last key release // TUNABLE
        const keyReleaseThreshold = 0.01;

        // Check the keyReleased flag after the threshold duration
        if (timeSinceLastKeyRelease >= keyReleaseThreshold) {
            this.keyReleased = false;
        }

        // Set the object's rotation based on the current velocity direction
        if (this.body.velocity.length() > 0 && direction.length > 0 && !this.keyReleased) {
            const angle = Math.atan2(this.body.velocity.x, this.body.velocity.z) + Math.PI;
            this.targetRotation = angle;
        } else if (this.keyReleased) {
            this.targetRotation = this.rotation.y;
        }

        // Smoothly interpolate the character's rotation
        const rotationSpeed = 0.2; // TUNABLE, the smaller the smoother
        const deltaAngle = (this.targetRotation - this.rotation.y + Math.PI) % (2 * Math.PI) - Math.PI;
        this.rotation.y += deltaAngle * rotationSpeed;
    }

    jump() { // Makes the character jump parallel to Y axis via forces (what's cool is the forces in different directions are all accounted for by the engine)
        if (!this.state.isGrounded) {
            return; // Do not jump if the character is not grounded
        }
        
        // const jumpForce = this.state.jumpHeight;
        // Apply an impulse in the Y direction
        // this.body.applyImpulse(new CANNON.Vec3(0, jumpForce, 0), this.body.position);

        // Gravity will bring it down, no worries.
        const jumpSpeed = Math.sqrt(2 * this.state.jumpHeight * Math.abs(this.parent.state.world.gravity.y));

        // Set Y velocity directly
        this.body.velocity.y = jumpSpeed;

        // Set the isGrounded flag to false after jumping
        this.state.isGrounded = false;
    }

    update(camera) {
        // Read user input and move accordingly
        const keys = this.parent.state.keys;
        const cameraVectors = this.getCameraVectors(camera);

        let keyz = ""; // for kinematic
        for (const key in keys) {
            if (keys[key]) { // if an input is spotted at that key
                // this.move(key, cameraVectors);
                keyz += key; // for kinematic
            }
        }
        this.move(keyz, cameraVectors); // for kinematic

        if (keys[' ']) { // putting it out reduces the check count.
            this.jump();
        }

        // Update Three.js object position to match Cannon.js body position (Two different systems)
        this.position.copy(this.body.position);
        this.position.add(this.state.colliderOffset);

        // Advance tween animations, if any exist
        // TWEEN.update(); // Just gonna keep it here as a reminder, in case needed for character animation

        // For debugging, collider visualization
        // this.colliderMesh.position.copy(this.body.position);

        // Log the positions of both the Cannon.js body and the Three.js visual object
        // console.log("Cannon.js body position:", this.body.position);
        // console.log("Three.js visual object position:", this.position);
    }
}

export default Player;
