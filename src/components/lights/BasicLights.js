import { Group, SpotLight, AmbientLight, HemisphereLight } from 'three';

class BasicLights extends Group {
    constructor(...args) {
        // Invoke parent Group() constructor with our args
        super(...args);

        // Simulating the front facing sun
        const sun1 = new SpotLight(0xffffff, 2, 100, 2, 1, 1);
        sun1.position.set(15, 50, 0);
        sun1.target.position.set(-7, 0, 0);
        // const sun2 = new SpotLight().copy(sun1);
        // sun2.position.set(10, 50, -5);

        // sunset beach color
        const ambi = new AmbientLight(0xfbdc5c, 1.32); 

        // No need for this
        // const hemi = new HemisphereLight(0xffffbb, 0x080820, 2.3);
        // hemi.position.set(0, -0.5, 0);

        this.add(ambi, sun1);
    }
}

export default BasicLights;
