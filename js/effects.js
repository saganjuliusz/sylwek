// Tworzenie gwiazd
function createStars() {
    const stars = document.querySelector('.stars');
    for (let i = 0; i < 200; i++) {
        const star = document.createElement('div');
        star.className = 'star';
        star.style.left = `${Math.random() * 100}%`;
        star.style.top = `${Math.random() * 100}%`;
        star.style.width = `${Math.random() * 3}px`;
        star.style.height = star.style.width;
        star.style.setProperty('--duration', `${Math.random() * 3 + 1}s`);
        stars.appendChild(star);
    }
}

// Tworzenie budynków
function createBuildings() {
    const skyline = document.querySelector('.city-skyline');
    for (let i = 0; i < 20; i++) {
        const building = document.createElement('div');
        building.className = 'building';
        const height = Math.random() * 150 + 100;
        building.style.height = `${height}px`;
        building.style.left = `${i * 5}%`;
        building.style.width = `${Math.random() * 30 + 20}px`;
        skyline.appendChild(building);
    }
}

// Inicjalizacja efektów
createStars();
createBuildings();