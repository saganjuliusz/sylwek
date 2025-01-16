class ParticleSystem {
    constructor() {
        this.particles = [];
        this.container = document.createElement('div');
        this.container.className = 'particle-container';
        document.body.appendChild(this.container);
    }

    createParticle(x, y, color = '#fff') {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        particle.style.backgroundColor = color;
        
        const angle = Math.random() * Math.PI * 2;
        const velocity = Math.random() * 5 + 2;
        const data = {
            element: particle,
            x,
            y,
            vx: Math.cos(angle) * velocity,
            vy: Math.sin(angle) * velocity - 5,
            life: 1,
            decay: Math.random() * 0.02 + 0.02
        };

        this.particles.push(data);
        this.container.appendChild(particle);
    }

    update() {
        this.particles = this.particles.filter(particle => {
            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vy += 0.2;
            particle.life -= particle.decay;

            particle.element.style.transform = `translate(${particle.x}px, ${particle.y}px)`;
            particle.element.style.opacity = particle.life;

            if (particle.life <= 0) {
                this.container.removeChild(particle.element);
                return false;
            }
            return true;
        });
    }

    burst(x, y, count = 20, color = '#fff') {
        for (let i = 0; i < count; i++) {
            this.createParticle(x, y, color);
        }
    }

    animate() {
        this.update();
        requestAnimationFrame(() => this.animate());
    }
}

const particleSystem = new ParticleSystem();
export default particleSystem;
