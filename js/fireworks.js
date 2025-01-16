class Particle3D {
    constructor(x, y, z, config = {}) {
        this.element = document.createElement('div');
        this.element.className = 'particle-3d';

        // Pozycja pocz¹tkowa
        this.x = x;
        this.y = y;
        this.z = z;

        // Konfiguracja cz¹steczki
        this.size = config.size || Math.random() * 4 + 2;
        this.maxLife = config.life || 1;
        this.life = this.maxLife;
        this.decay = config.decay || (Math.random() * 0.02 + 0.02);

        // Prêdkoœæ i fizyka
        const speed = config.speed || 20;
        const angle = Math.random() * Math.PI * 2;
        const elevation = Math.random() * Math.PI - Math.PI / 2;

        this.velocityX = Math.cos(angle) * Math.cos(elevation) * speed;
        this.velocityY = Math.sin(elevation) * speed;
        this.velocityZ = Math.sin(angle) * Math.cos(elevation) * speed;

        // Rotacja
        this.rotationX = Math.random() * 360;
        this.rotationY = Math.random() * 360;
        this.rotationZ = Math.random() * 360;
        this.rotationSpeedX = (Math.random() - 0.5) * 10;
        this.rotationSpeedY = (Math.random() - 0.5) * 10;
        this.rotationSpeedZ = (Math.random() - 0.5) * 10;

        // Ustawienia wizualne
        this.element.style.width = `${this.size}px`;
        this.element.style.height = `${this.size}px`;
        this.element.style.position = 'absolute';
        this.element.style.transform = this.getTransform();

        // Efekty
        this.trail = [];
        this.maxTrailLength = config.trailLength || 5;
    }

    getTransform() {
        return `translate3d(${this.x}px, ${this.y}px, ${this.z}px) 
                rotateX(${this.rotationX}deg) 
                rotateY(${this.rotationY}deg) 
                rotateZ(${this.rotationZ}deg)`;
    }

    update(deltaTime = 1 / 60) {
        // Aktualizacja pozycji
        this.x += this.velocityX * deltaTime;
        this.y += this.velocityY * deltaTime;
        this.z += this.velocityZ * deltaTime;

        // Fizyka
        this.velocityY += 9.81 * deltaTime; // Grawitacja
        this.velocityX *= 0.99; // Opór powietrza
        this.velocityZ *= 0.99;

        // Rotacja
        this.rotationX += this.rotationSpeedX * deltaTime;
        this.rotationY += this.rotationSpeedY * deltaTime;
        this.rotationZ += this.rotationSpeedZ * deltaTime;

        // Efekt œladu
        if (this.trail.length >= this.maxTrailLength) {
            const oldTrail = this.trail.shift();
            oldTrail.remove();
        }

        const trailElement = document.createElement('div');
        trailElement.className = 'particle-trail';
        trailElement.style.cssText = this.element.style.cssText;
        trailElement.style.opacity = '0.5';
        this.trail.push(trailElement);
        document.body.appendChild(trailElement);

        // Aktualizacja ¿ycia
        this.life -= this.decay * deltaTime;
        const lifeRatio = this.life / this.maxLife;

        // Aktualizacja wygl¹du
        this.element.style.transform = this.getTransform();
        this.element.style.opacity = lifeRatio;

        return this.life > 0;
    }

    destroy() {
        this.element.remove();
        this.trail.forEach(trail => trail.remove());
    }
}

class Firework3D {
    constructor(config = {}) {
        this.config = {
            particleCount: config.particleCount || 100,
            baseSize: config.baseSize || 3,
            baseSpeed: config.baseSpeed || 20,
            gravity: config.gravity || 9.81,
            trailLength: config.trailLength || 5,
            colors: config.colors || ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff']
        };

        this.particles = [];
        this.lastUpdate = performance.now();
        this.active = false;
    }

    launch(x, y) {
        this.active = true;
        const baseHue = Math.random() * 360;

        for (let i = 0; i < this.config.particleCount; i++) {
            const particleConfig = {
                size: Math.random() * 4 + this.config.baseSize,
                speed: Math.random() * 10 + this.config.baseSpeed,
                trailLength: this.config.trailLength,
                life: Math.random() * 0.5 + 0.5,
                decay: Math.random() * 0.02 + 0.01
            };

            const particle = new Particle3D(x, y, 0, particleConfig);

            // Generowanie kolorów
            const hue = (baseHue + Math.random() * 30 - 15) % 360;
            const colorStyle = `hsl(${hue}, 100%, 50%)`;
            particle.element.style.background = colorStyle;
            particle.element.style.boxShadow = `0 0 ${particleConfig.size * 2}px ${colorStyle}`;

            document.body.appendChild(particle.element);
            this.particles.push(particle);
        }

        this.update();
    }

    update() {
        if (!this.active) return;

        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastUpdate) / 1000;
        this.lastUpdate = currentTime;

        this.particles = this.particles.filter(particle => {
            const alive = particle.update(deltaTime);
            if (!alive) {
                particle.destroy();
            }
            return alive;
        });

        if (this.particles.length > 0) {
            requestAnimationFrame(() => this.update());
        } else {
            this.active = false;
        }
    }

    static createExplosion(x, y, config = {}) {
        const firework = new Firework3D(config);
        firework.launch(x, y);
        return firework;
    }
}

// Style CSS
const style = document.createElement('style');
style.textContent = `
    .particle-3d {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        will-change: transform, opacity;
    }
    
    .particle-trail {
        position: absolute;
        border-radius: 50%;
        pointer-events: none;
        will-change: transform, opacity;
        animation: fadeOut 0.5s linear forwards;
    }
    
    @keyframes fadeOut {
        to {
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);

// Przyk³ad u¿ycia:
// const config = {
//     particleCount: 150,
//     baseSize: 4,
//     baseSpeed: 25,
//     trailLength: 8,
//     colors: ['#ff0000', '#00ff00', '#0000ff']
// };
// document.addEventListener('click', (e) => {
//     Firework3D.createExplosion(e.clientX, e.clientY, config);
// });