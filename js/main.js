// Tablica z fajerwerkami
let fireworks = [];

// Funkcja obliczaj¹ca nastêpny Sylwester
function getNextNewYear() {
    const now = new Date();
    const currentYear = now.getFullYear();
    const nextNewYear = new Date(currentYear + 1, 0, 1, 0, 0, 0); // 1 stycznia nastêpnego roku

    // Jeœli ju¿ min¹³ Sylwester tego roku, dodajemy rok
    if (now >= nextNewYear) {
        return new Date(currentYear + 2, 0, 1, 0, 0, 0);
    }

    return nextNewYear;
}

// Funkcja aktualizuj¹ca rok w tytule
function updateYear() {
    const nextNewYear = getNextNewYear();
    const yearElement = document.getElementById('year');
    if (yearElement) {
        yearElement.textContent = nextNewYear.getFullYear();
    }
    document.title = `Odliczanie do Sylwestra ${nextNewYear.getFullYear()}`;
}

// Funkcja aktualizuj¹ca odliczanie
function updateCountdown() {
    const target = getNextNewYear().getTime();
    const now = new Date().getTime();
    const difference = target - now;

    // Obliczanie wartoœci
    const days = Math.floor(difference / (1000 * 60 * 60 * 24));
    const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((difference % (1000 * 60)) / 1000);

    // Aktualizacja elementów DOM
    const daysElement = document.getElementById('days');
    const hoursElement = document.getElementById('hours');
    const minutesElement = document.getElementById('minutes');
    const secondsElement = document.getElementById('seconds');

    if (daysElement && hoursElement && minutesElement && secondsElement) {
        daysElement.textContent = days.toString().padStart(2, '0');
        hoursElement.textContent = hours.toString().padStart(2, '0');
        minutesElement.textContent = minutes.toString().padStart(2, '0');
        secondsElement.textContent = seconds.toString().padStart(2, '0');
    }

    // Sprawdzanie czy to ju¿ Nowy Rok
    const newYearMessage = document.getElementById('new-year-message');
    if (newYearMessage) {
        if (difference <= 0) {
            newYearMessage.classList.remove('hidden');
            // Dodanie wiêkszej iloœci fajerwerków o pó³nocy
            for (let i = 0; i < 10; i++) {
                setTimeout(() => {
                    const x = Math.random() * window.innerWidth;
                    const y = Math.random() * (window.innerHeight / 2);
                    fireworks.push(new Firework3D(x, y));
                }, i * 300);
            }
        } else {
            newYearMessage.classList.add('hidden');
        }
    }
}

// Funkcja animacji
function animate() {
    fireworks = fireworks.filter(firework => firework.update());

    // Losowe fajerwerki w tle
    if (Math.random() < 0.05) {
        const x = Math.random() * window.innerWidth;
        const y = Math.random() * (window.innerHeight / 2);
        fireworks.push(new Firework3D(x, y));
    }

    requestAnimationFrame(animate);
}

// Nas³uchiwacze zdarzeñ
document.addEventListener('click', (e) => {
    fireworks.push(new Firework3D(e.clientX, e.clientY));
});

window.addEventListener('resize', () => {
    document.querySelector('.stars').innerHTML = '';
    document.querySelector('.city-skyline').innerHTML = '';
    createStars();
    createBuildings();
});

// Inicjalizacja
function init() {
    updateYear();
    createStars();
    createBuildings();
    setInterval(updateCountdown, 1000);
    animate();
}

// Uruchomienie po za³adowaniu strony
document.addEventListener('DOMContentLoaded', init);
