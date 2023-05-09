import * as THREE from 'three'
import * as CANNON from 'cannon-es';
import { Group } from 'three'

class Water extends Group {
    constructor (
        parent, startingPosition, numberOfParticles, waterMaterial, radius,
        // adding physics parameters
    ) {
        super(); // inherit parent class Group properties

        this.particles = [];
        this.numberOfParticles = numberOfParticles;
        this.parent = parent;

        // creating all of the particles
        for (let i = 0; i < numberOfParticles; i++) {
            // making the sphere particles (visual)
            const sphere = new THREE.SphereGeometry(radius); // remember to add more than 8 segments
            const material = new THREE.MeshBasicMaterial({
                color: 0x0032ff,
                opacity: 0.5,
            })

            // generating mesh of the particle
            const particle = new THREE.Mesh(sphere, material)

            // generating a random starting position for each ball
            const offsetX = (Math.random() * 2) - 1;   // Random number between -1 and 1
            const offsetY = (Math.random() * 2) - 1;   // Random number between -1 and 1
            const offsetZ = (Math.random() * 2) - 1;   // Random number between -1 and 1
            const offsetVector = new CANNON.Vec3(offsetX, offsetY, offsetZ);

            // Add the offset vector to your original vector
            const randomStartingPosition = startingPosition.vadd(offsetVector);

            // making the sphere particles (physical)
            const pbody = new CANNON.Body({ // particle body
                mass: 1,
                shape: new CANNON.Sphere(radius), // shape of the object's collision volume
                material: waterMaterial,
                linearDamping: 0,
                fixedRotation: false, // disables forced rotation due to collision
                position: randomStartingPosition, // starting position of the object in the physics world
            });
            pbody.updateMassProperties(); // Need to call this after setting up the parameter
            parent.bodyIDToString[pbody.id] = "WaterParticle";
            
            // Add body to the world (physics world)
            parent.state.world.addBody(pbody);

            // Add a collision event listener to the building's MAIN physics body
            pbody.addEventListener("collide", this.handleCollision.bind(this));

            particle.position.copy(pbody.position);

            this.particles.push({ particle, pbody });
        }

        // adding all particles to the parent
        for (let i = 0; i < numberOfParticles; i++) {
            parent.add(this.particles[i].particle)
        }

        // Add self to parent's update list
        parent.addToUpdateList(this);
    }

    handleCollision(event) { // the function executed when a collision happens between something and the main physical buildling.
        if (this.parent.bodyIDToString[event.contact.bj.id] == "Land") {
            // event.contact.bi.applyForce(new CANNON.Vec3(0, 10, 0), event.contact.bi.position);
        }

        if (this.parent.bodyIDToString[event.contact.bj.id] == "WaterParticle" ) {
        }
    }
    
    update() {
        for (let i = 0; i < this.numberOfParticles; i++) {
            let p = this.particles[i]
            p.particle.position.copy(p.pbody.position);
        }
    }
}

export default Water;
