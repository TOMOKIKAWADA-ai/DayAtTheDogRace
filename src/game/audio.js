function clampVolume(value) {
  return Math.min(1, Math.max(0, value));
}

function clampPlaybackRate(value) {
  return Math.min(2, Math.max(0.5, value));
}

function configureRate(audio, playbackRate) {
  audio.playbackRate = clampPlaybackRate(playbackRate);

  if ('preservesPitch' in audio) {
    audio.preservesPitch = false;
  }
  if ('mozPreservesPitch' in audio) {
    audio.mozPreservesPitch = false;
  }
  if ('webkitPreservesPitch' in audio) {
    audio.webkitPreservesPitch = false;
  }
}

export class GameAudio {
  constructor(sounds = {}) {
    this.sounds = sounds;
    this.enabled = false;
    this.loopPlayers = new Map();
    this.activeShots = new Set();
    this.lastPlayedAt = new Map();
  }

  preload() {
    Object.values(this.sounds).forEach((sound) => {
      if (!sound?.path) return;

      const audio = new Audio(sound.path);
      audio.preload = 'auto';
      audio.load();
    });
  }

  setEnabled(enabled) {
    this.enabled = enabled;

    if (!enabled) {
      this.stopOneShots();
      this.pauseLoops();
    }
  }

  setLoop(id, volume, playbackRate = 1) {
    const audio = this.getLoopPlayer(id);
    if (!audio) return;

    const nextVolume = clampVolume(volume);
    audio.volume = nextVolume;
    configureRate(audio, playbackRate);

    if (!this.enabled || nextVolume <= 0.005) {
      audio.pause();
      return;
    }

    if (audio.paused) {
      audio.play().catch(() => {
        audio.pause();
      });
    }
  }

  playOneShot(id, volume = 1, options = {}) {
    if (!this.enabled && !options.force) return;

    const sound = this.sounds[id];
    if (!sound?.path) return;

    const now = performance.now();
    const cooldown = options.cooldown ?? sound.cooldown ?? 0;
    const lastPlayedAt = this.lastPlayedAt.get(id) ?? -Infinity;
    if (now - lastPlayedAt < cooldown * 1000) return;
    this.lastPlayedAt.set(id, now);

    const audio = new Audio(sound.path);
    audio.preload = 'auto';
    audio.volume = clampVolume(volume);
    configureRate(audio, options.playbackRate ?? 1);

    const cleanup = () => {
      this.activeShots.delete(audio);
    };

    this.activeShots.add(audio);
    audio.addEventListener('ended', cleanup, { once: true });
    audio.addEventListener('error', cleanup, { once: true });
    audio.play().catch(cleanup);
  }

  pauseLoops() {
    this.loopPlayers.forEach((audio) => audio.pause());
  }

  stopOneShots() {
    this.activeShots.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    this.activeShots.clear();
  }

  dispose() {
    this.stopOneShots();
    this.loopPlayers.forEach((audio) => {
      audio.pause();
      audio.src = '';
    });
    this.loopPlayers.clear();
  }

  getLoopPlayer(id) {
    if (this.loopPlayers.has(id)) {
      return this.loopPlayers.get(id);
    }

    const sound = this.sounds[id];
    if (!sound?.path) return null;

    const audio = new Audio(sound.path);
    audio.loop = true;
    audio.preload = 'auto';
    audio.volume = 0;
    this.loopPlayers.set(id, audio);
    return audio;
  }
}
