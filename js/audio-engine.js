class AudioEngine {
    constructor() {
        this.audioContext = null;
        this.playlist = [];
        this.currentTrack = null;
        this.gainNode = null;
        this.currentIndex = 0;
        this.isPlaying = false;
        this.volume = 0.6;
        this.isLooping = false;
        this.isShuffle = true;
        this.fadeOutDuration = 2;
        this.fadeInDuration = 1;
        this.retryAttempts = 3;
        this.retryDelay = 1000;
        this.visualizer = null;
        this.isTransitioning = false;
        this.crossfadeDuration = 1;
        this.preloadCount = 5;
        this.audioBufferCache = new Map();
        this.trackEndTimeout = null;
        this.autoplayAttempts = 0;
        this.maxAutoplayAttempts = 10;
    }

    async initializeAudioContext() {
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

            // Próba automatycznego wznowienia kontekstu
            const attemptAutoplay = async () => {
                if (this.audioContext.state === 'suspended' && this.autoplayAttempts < this.maxAutoplayAttempts) {
                    await this.audioContext.resume();
                    this.autoplayAttempts++;
                    if (this.audioContext.state === 'suspended') {
                        setTimeout(attemptAutoplay, 500);
                    }
                }
            };

            attemptAutoplay();

            await this.setupAudioNodes();
            await this.loadPlaylist();
            this.initializeControls();
            this.initializeKeyboardControls();
            this.initializeVisualizer();
            this.setupErrorHandling();

            // Rozpocznij odtwarzanie automatycznie
            this.startPlayback();

            // Dodatkowa próba wznowienia w przypadku interakcji użytkownika
            document.addEventListener('click', () => {
                if (this.audioContext.state === 'suspended') {
                    this.audioContext.resume();
                }
            }, { once: true });

        } catch (error) {
            console.error('Błąd inicjalizacji kontekstu audio:', error);
            this.displayError('Błąd inicjalizacji audio. Spróbuj odświeżyć stronę.');
        }
    }

    async setupAudioNodes() {
        try {
            this.gainNode = this.audioContext.createGain();
            this.analyser = this.audioContext.createAnalyser();
            this.compressor = this.audioContext.createDynamicsCompressor();
            this.equalizer = this.createEqualizer();

            this.analyser.fftSize = 2048;
            this.analyser.smoothingTimeConstant = 0.8;

            const currentTime = this.audioContext.currentTime;
            this.compressor.threshold.setValueAtTime(-24, currentTime);
            this.compressor.knee.setValueAtTime(30, currentTime);
            this.compressor.ratio.setValueAtTime(12, currentTime);
            this.compressor.attack.setValueAtTime(0.003, currentTime);
            this.compressor.release.setValueAtTime(0.25, currentTime);

            this.gainNode.connect(this.equalizer);
            this.equalizer.connect(this.compressor);
            this.compressor.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            this.gainNode.gain.setValueAtTime(this.volume, currentTime);
        } catch (error) {
            console.error('Błąd konfiguracji węzłów audio:', error);
            throw new Error('Nie udało się skonfigurować węzłów audio');
        }
    }

    createEqualizer() {
        try {
            const frequencies = [60, 170, 350, 1000, 3500, 10000];
            const equalizer = frequencies.map(freq => {
                const filter = this.audioContext.createBiquadFilter();
                filter.type = 'peaking';
                filter.frequency.value = freq;
                filter.Q.value = 1;
                filter.gain.value = 0;
                return filter;
            });

            equalizer.reduce((prev, curr) => {
                if (prev && curr) {
                    prev.connect(curr);
                    return curr;
                }
                return prev;
            });

            return equalizer[0];
        } catch (error) {
            console.error('Błąd tworzenia equalizera:', error);
            throw new Error('Nie udało się utworzyć equalizera');
        }
    }

    async loadPlaylist() {
        try {
            const response = await fetch('/sylwek/api/get_files.php');
            if (!response.ok) {
                throw new Error(`Błąd HTTP: ${response.status}`);
            }

            const data = await response.json();
            if (!data.SYLWESTER || !Array.isArray(data.SYLWESTER)) {
                throw new Error('Nieprawidłowa struktura danych playlisty');
            }

            this.playlist = data.SYLWESTER.map(track => ({
                ...track,
                path: `/sylwek/music/${encodeURIComponent(track.name)}`,
                duration: 0,
                loadState: 'pending'
            }));

            if (this.isShuffle) {
                this.shufflePlaylist();
            }

            await this.preloadTracks();
        } catch (error) {
            console.error('Błąd ładowania playlisty:', error);
            this.displayError('Nie udało się załadować playlisty. Sprawdź połączenie i odśwież stronę.');
        }
    }

    async preloadTracks() {
        if (!this.playlist.length) return;

        const preloadPromises = [];
        for (let i = 0; i < Math.min(this.preloadCount, this.playlist.length); i++) {
            const index = (this.currentIndex + i) % this.playlist.length;
            if (this.playlist[index]) {
                preloadPromises.push(this.loadTrackBuffer(this.playlist[index]));
            }
        }

        try {
            await Promise.allSettled(preloadPromises);
        } catch (error) {
            console.error('Błąd podczas preloadowania utworów:', error);
        }
    }

    async loadTrackBuffer(track) {
        if (!track || !track.path) return null;
        if (this.audioBufferCache.has(track.path)) {
            return this.audioBufferCache.get(track.path);
        }

        if (track.loadState === 'loading') return;
        track.loadState = 'loading';

        try {
            const response = await fetch(track.path);
            if (!response.ok) {
                throw new Error(`Błąd HTTP: ${response.status}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            if (audioBuffer) {
                track.duration = audioBuffer.duration;
                this.audioBufferCache.set(track.path, audioBuffer);
                track.loadState = 'loaded';
                return audioBuffer;
            }
        } catch (error) {
            console.error(`Błąd ładowania utworu ${track.name}:`, error);
            track.loadState = 'error';
            return null;
        }
    }

    async startPlayback(retryCount = 0) {
        if (this.isTransitioning || !this.playlist.length) return;
        this.isTransitioning = true;

        try {
            const track = this.playlist[this.currentIndex];
            if (!track) {
                throw new Error('Brak utworu do odtworzenia');
            }

            const buffer = await this.loadTrackBuffer(track);
            if (!buffer) {
                throw new Error('Nie udało się załadować bufora audio');
            }

            if (this.currentTrack) {
                await this.crossfade();
            } else {
                await this.initializeNewTrack(buffer);
            }

            this.isPlaying = true;
            this.updateNowPlaying(track.name);
            this.preloadTracks();

            this.setupTrackEndTimer(buffer.duration);

        } catch (error) {
            console.error('Błąd odtwarzania:', error);
            if (retryCount < this.retryAttempts) {
                setTimeout(() => this.startPlayback(retryCount + 1), this.retryDelay);
            } else {
                this.displayError(`Nie udało się odtworzyć: ${this.playlist[this.currentIndex]?.name}`);
                this.playNext();
            }
        } finally {
            this.isTransitioning = false;
        }
    }

    async crossfade() {
        if (!this.currentTrack) return;

        const oldTrack = this.currentTrack;
        const oldGain = this.audioContext.createGain();
        oldTrack.connect(oldGain);
        oldGain.connect(this.audioContext.destination);

        const fadeOutStart = this.audioContext.currentTime;
        oldGain.gain.setValueAtTime(this.volume, fadeOutStart);
        oldGain.gain.linearRampToValueAtTime(0, fadeOutStart + this.crossfadeDuration);

        const buffer = this.audioBufferCache.get(this.playlist[this.currentIndex].path);
        if (!buffer) {
            throw new Error('Brak bufora dla nowego utworu');
        }

        await this.initializeNewTrack(buffer);

        this.gainNode.gain.setValueAtTime(0, fadeOutStart);
        this.gainNode.gain.linearRampToValueAtTime(this.volume, fadeOutStart + this.crossfadeDuration);

        setTimeout(() => {
            oldTrack.stop();
            oldTrack.disconnect();
            oldGain.disconnect();
        }, this.crossfadeDuration * 1000);
    }

    async initializeNewTrack(buffer) {
        if (!buffer) return;

        this.currentTrack = this.audioContext.createBufferSource();
        this.currentTrack.buffer = buffer;
        this.currentTrack.connect(this.gainNode);

        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }

        this.currentTrack.start();
    }

    setupTrackEndTimer(duration) {
        if (this.trackEndTimeout) {
            clearTimeout(this.trackEndTimeout);
        }

        if (!duration || duration <= 0) return;

        this.trackEndTimeout = setTimeout(() => {
            if (this.isLooping) {
                this.startPlayback();
            } else {
                this.playNext();
            }
        }, (duration - 0.1) * 1000);
    }

    setupErrorHandling() {
        window.addEventListener('error', (event) => {
            console.error('Złapano błąd:', event.error);
            this.displayError('Wystąpił nieoczekiwany błąd. Odświeżenie strony może pomóc.');
        });

        window.addEventListener('unhandledrejection', (event) => {
            console.error('Nieobsłużona obietnica:', event.reason);
            this.displayError('Wystąpił błąd połączenia. Sprawdź internet i spróbuj ponownie.');
        });
    }

    async playNext() {
        if (this.isTransitioning || !this.playlist.length) return;

        const oldIndex = this.currentIndex;
        this.currentIndex = (this.currentIndex + 1) % this.playlist.length;

        try {
            await this.startPlayback();
        } catch (error) {
            console.error('Błąd podczas przełączania na następny utwór:', error);
            this.currentIndex = oldIndex;
            this.displayError('Nie udało się przełączyć na następny utwór.');
        }
    }

    async playPrevious() {
        if (this.isTransitioning || !this.playlist.length) return;

        const oldIndex = this.currentIndex;
        this.currentIndex = (this.currentIndex - 1 + this.playlist.length) % this.playlist.length;

        try {
            await this.startPlayback();
        } catch (error) {
            console.error('Błąd podczas przełączania na poprzedni utwór:', error);
            this.currentIndex = oldIndex;
            this.displayError('Nie udało się przełączyć na poprzedni utwór.');
        }
    }

    async togglePlayPause() {
        if (this.isTransitioning || !this.currentTrack) return;

        try {
            if (this.isPlaying) {
                await this.audioContext.suspend();
                if (this.trackEndTimeout) {
                    clearTimeout(this.trackEndTimeout);
                }
            } else {
                await this.audioContext.resume();
                if (this.currentTrack && this.currentTrack.buffer) {
                    const remainingTime = this.currentTrack.buffer.duration -
                        (this.audioContext.currentTime % this.currentTrack.buffer.duration);
                    this.setupTrackEndTimer(remainingTime);
                }
            }
            this.isPlaying = !this.isPlaying;
            this.updatePlayPauseButton();
        } catch (error) {
            console.error('Błąd podczas przełączania play/pause:', error);
            this.displayError('Wystąpił problem z odtwarzaniem.');
        }
    }

    shufflePlaylist() {
        if (!this.playlist.length) return;

        const currentTrack = this.playlist[this.currentIndex];

        for (let i = this.playlist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
        }

        const newIndex = this.playlist.findIndex(track => track === currentTrack);
        if (newIndex !== -1) {
            [this.playlist[0], this.playlist[newIndex]] = [this.playlist[newIndex], this.playlist[0]];
            this.currentIndex = 0;
        }
    }

    setVolume(value) {
        this.volume = Math.max(0, Math.min(1, value));
        if (this.gainNode) {
            this.gainNode.gain.linearRampToValueAtTime(
                this.volume,
                this.audioContext.currentTime + 0.1
            );
        }
        this.updateVolumeDisplay();
    }

    toggleLoop() {
        this.isLooping = !this.isLooping;
        this.updateLoopButton();
    }

    toggleShuffle() {
        this.isShuffle = !this.isShuffle;
        if (this.isShuffle) {
            this.shufflePlaylist();
        }
        this.updateShuffleButton();
    }

    initializeControls() {
        const controls = document.createElement('div');
        controls.id = 'audio-controls';
        controls.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.85);
        padding: 20px;
        border-radius: 15px;
        display: flex;
        gap: 15px;
        align-items: center;
        z-index: 1000;
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        const buttonStyle = `
            padding: 10px;
            border: none;
            border-radius: 5px;
            background: #4CAF50;
            color: white;
            cursor: pointer;
            transition: all 0.3s;
            width: 45px;
            height: 45px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 18px;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            user-select: none;
        `;

        const prevButton = this.createButton('⏮', () => this.playPrevious(), buttonStyle);
        const playPauseButton = this.createButton('⏸', () => this.togglePlayPause(), buttonStyle);
        const nextButton = this.createButton('⏭', () => this.playNext(), buttonStyle);
        const loopButton = this.createButton('🔁', () => this.toggleLoop(), buttonStyle);
        const shuffleButton = this.createButton('🔀', () => this.toggleShuffle(), buttonStyle);

        const volumeControl = document.createElement('input');
        volumeControl.type = 'range';
        volumeControl.min = '0';
        volumeControl.max = '1';
        volumeControl.step = '0.1';
        volumeControl.value = this.volume.toString();
        volumeControl.style.cssText = `
            width: 120px;
            margin: 0 15px;
            -webkit-appearance: none;
            background: rgba(255, 255, 255, 0.2);
            height: 4px;
            border-radius: 2px;
            cursor: pointer;
        `;
        volumeControl.addEventListener('input', (e) => this.setVolume(parseFloat(e.target.value)));

        [prevButton, playPauseButton, nextButton, loopButton, shuffleButton].forEach(button => {
            button.addEventListener('mouseover', () => {
                button.style.transform = 'scale(1.1)';
            });
            button.addEventListener('mouseout', () => {
                button.style.transform = 'scale(1)';
            });
            controls.appendChild(button);
        });
        controls.appendChild(volumeControl);

        document.body.appendChild(controls);
    }

    initializeKeyboardControls() {
        document.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            switch (e.code) {
                case 'Space':
                    e.preventDefault();
                    this.togglePlayPause();
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.playPrevious();
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.playNext();
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.setVolume(Math.min(1, this.volume + 0.1));
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.setVolume(Math.max(0, this.volume - 0.1));
                    break;
            }
        });
    }

    initializeVisualizer() {
        const canvas = document.createElement('canvas');
        canvas.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            z-index: -1;
            opacity: 0.5;
            pointer-events: none;
        `;
        document.body.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };

        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        const draw = () => {
            if (!this.analyser) return;

            requestAnimationFrame(draw);
            this.analyser.getByteFrequencyData(dataArray);

            ctx.fillStyle = 'rgb(0, 0, 0)';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            const barWidth = (canvas.width / bufferLength) * 2.5;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] * 2;
                const hue = (i / bufferLength) * 360;

                ctx.fillStyle = `hsl(${hue}, 100%, 50%)`;
                ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);

                x += barWidth + 1;
            }
        };

        draw();
    }

    createButton(text, onClick, style) {
        const button = document.createElement('button');
        button.textContent = text;
        button.style.cssText = style;
        button.addEventListener('click', (e) => {
            e.preventDefault();
            onClick();
        });
        return button;
    }

    displayError(message) {
        if (!message) return;

        const errorDiv = document.getElementById('player-error') || this.createErrorElement();
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';

        setTimeout(() => {
            if (errorDiv) {
                errorDiv.style.display = 'none';
            }
        }, 5000);
    }

    createErrorElement() {
        const errorDiv = document.createElement('div');
        errorDiv.id = 'player-error';
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #ff5555;
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 1001;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            display: none;
            max-width: 300px;
            word-wrap: break-word;
            font-family: Arial, sans-serif;
        `;
        document.body.appendChild(errorDiv);
        return errorDiv;
    }

    updateNowPlaying(trackName) {
        if (!trackName) return;

        const nowPlayingDiv = document.getElementById('now-playing') || this.createNowPlayingElement();
        nowPlayingDiv.textContent = `Teraz odtwarzane: ${trackName}`;
    }

    createNowPlayingElement() {
        const nowPlayingDiv = document.createElement('div');
        nowPlayingDiv.id = 'now-playing';
        nowPlayingDiv.style.cssText = `
            position: fixed;
            bottom: 100px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(51, 51, 51, 0.9);
            color: white;
            padding: 15px;
            border-radius: 5px;
            z-index: 1000;
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
            font-size: 16px;
            font-weight: bold;
            max-width: 80%;
            text-align: center;
            word-wrap: break-word;
            font-family: Arial, sans-serif;
        `;
        document.body.appendChild(nowPlayingDiv);
        return nowPlayingDiv;
    }

    updatePlayPauseButton() {
        const playPauseButton = document.querySelector('#audio-controls button:nth-child(2)');
        if (playPauseButton) {
            playPauseButton.textContent = this.isPlaying ? '⏸' : '▶';
        }
    }

    updateLoopButton() {
        const loopButton = document.querySelector('#audio-controls button:nth-child(4)');
        if (loopButton) {
            loopButton.style.background = this.isLooping ?
                'linear-gradient(145deg, #2196F3, #1e88e5)' :
                'linear-gradient(145deg, #4CAF50, #45a049)';
        }
    }

    updateShuffleButton() {
        const shuffleButton = document.querySelector('#audio-controls button:nth-child(5)');
        if (shuffleButton) {
            shuffleButton.style.background = this.isShuffle ?
                'linear-gradient(145deg, #2196F3, #1e88e5)' :
                'linear-gradient(145deg, #4CAF50, #45a049)';
        }
    }

    updateVolumeDisplay() {
        const volumeControl = document.querySelector('#audio-controls input[type="range"]');
        if (volumeControl) {
            volumeControl.value = this.volume.toString();
        }
    }
}

// Automatyczne uruchomienie odtwarzacza
document.addEventListener('DOMContentLoaded', async () => {
    window.audioEngine = new AudioEngine();

    // Podjęcie próby automatycznego odtwarzania
    try {
        await window.audioEngine.initializeAudioContext();
    } catch (error) {
        console.error('Błąd podczas automatycznego uruchomienia:', error);
    }

    // Dodatkowa próba odtwarzania przy pierwszej interakcji użytkownika
    const startPlayback = async () => {
        if (window.audioEngine.audioContext?.state === 'suspended') {
            await window.audioEngine.audioContext.resume();
        }
        document.removeEventListener('click', startPlayback);
    };

    document.addEventListener('click', startPlayback);
});