"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type SoundName = "buttonclick" | "correct" | "wrong";
type BgmMode = "lobby" | "playing" | "none";

type SoundContextValue = {
  lobbyVolume: number;
  gameVolume: number;
  effectVolume: number;
  setLobbyVolume: (volume: number) => void;
  setGameVolume: (volume: number) => void;
  setEffectVolume: (volume: number) => void;
  setBgmMode: (mode: BgmMode | null) => void;
  playSound: (sound: SoundName) => void;
};

const soundFiles: Record<SoundName, string> = {
  buttonclick: "/sounds/buttonclick.mp3",
  correct: "/sounds/correct.mp3",
  wrong: "/sounds/wrong.mp3"
};

const SoundContext = createContext<SoundContextValue | null>(null);
const legacyVolumeStorageKey = "poker-sound-volume";
const lobbyVolumeStorageKey = "poker-lobby-volume";
const gameVolumeStorageKey = "poker-game-volume";
const effectVolumeStorageKey = "poker-effect-volume";

export function SoundProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [lobbyVolume, setLobbyVolumeState] = useState(0.65);
  const [gameVolume, setGameVolumeState] = useState(0.65);
  const [effectVolume, setEffectVolumeState] = useState(0.65);
  const [requestedBgmMode, setRequestedBgmMode] = useState<BgmMode | null>(null);
  const soundPoolRef = useRef<Record<SoundName, HTMLAudioElement[]> | null>(null);
  const lobbyBgmRef = useRef<HTMLAudioElement | null>(null);
  const playingBgmRef = useRef<HTMLAudioElement | null>(null);
  const unlockBgmRef = useRef<(() => void) | null>(null);
  const activeBgmMode: BgmMode = requestedBgmMode ?? (pathname === "/" || pathname.startsWith("/games/") ? "lobby" : "none");
  const activeVolume = activeBgmMode === "playing" ? gameVolume : lobbyVolume;

  useEffect(() => {
    const legacySaved = window.localStorage.getItem(legacyVolumeStorageKey);
    const fallbackVolume = legacySaved && Number.isFinite(Number(legacySaved)) ? clampVolume(Number(legacySaved)) : 0.65;
    const savedLobbyVolume = window.localStorage.getItem(lobbyVolumeStorageKey);
    const savedGameVolume = window.localStorage.getItem(gameVolumeStorageKey);
    const savedEffectVolume = window.localStorage.getItem(effectVolumeStorageKey);
    setLobbyVolumeState(savedLobbyVolume && Number.isFinite(Number(savedLobbyVolume)) ? clampVolume(Number(savedLobbyVolume)) : fallbackVolume);
    setGameVolumeState(savedGameVolume && Number.isFinite(Number(savedGameVolume)) ? clampVolume(Number(savedGameVolume)) : fallbackVolume);
    setEffectVolumeState(savedEffectVolume && Number.isFinite(Number(savedEffectVolume)) ? clampVolume(Number(savedEffectVolume)) : fallbackVolume);
    soundPoolRef.current = {
      buttonclick: createSoundPool("buttonclick", 5),
      correct: createSoundPool("correct", 2),
      wrong: createSoundPool("wrong", 2)
    };
  }, []);

  const setLobbyVolume = useCallback((nextVolume: number) => {
    const clamped = clampVolume(nextVolume);
    setLobbyVolumeState(clamped);
    window.localStorage.setItem(lobbyVolumeStorageKey, String(clamped));
  }, []);

  const setGameVolume = useCallback((nextVolume: number) => {
    const clamped = clampVolume(nextVolume);
    setGameVolumeState(clamped);
    window.localStorage.setItem(gameVolumeStorageKey, String(clamped));
  }, []);

  const setEffectVolume = useCallback((nextVolume: number) => {
    const clamped = clampVolume(nextVolume);
    setEffectVolumeState(clamped);
    window.localStorage.setItem(effectVolumeStorageKey, String(clamped));
  }, []);

  const playSound = useCallback(
    (sound: SoundName) => {
      if (effectVolume <= 0) return;
      const pool = soundPoolRef.current?.[sound] ?? createSoundPool(sound, sound === "buttonclick" ? 5 : 2);
      if (!soundPoolRef.current) soundPoolRef.current = { buttonclick: [], correct: [], wrong: [] };
      soundPoolRef.current[sound] = pool;
      const audio = pool.find((item) => item.paused || item.ended) ?? pool[0];
      audio.pause();
      audio.currentTime = 0;
      audio.volume = effectVolume;
      void audio.play().catch(() => {
        // Browsers may block audio until the first user gesture.
      });
    },
    [effectVolume]
  );

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const clickable = target.closest("button, a.primary-action, a.secondary-action, a.outline-action");
      if (!(clickable instanceof HTMLElement)) return;
      if (clickable.closest("[data-sound='none'], .bluff-play-button, .play-card-button:not(.compact-action)")) return;
      if ("disabled" in clickable && Boolean(clickable.disabled)) return;
      playSound("buttonclick");
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [playSound]);

  useEffect(() => {
    if (!lobbyBgmRef.current) {
      lobbyBgmRef.current = new Audio("/sounds/bgm-lobby.mp3");
      lobbyBgmRef.current.loop = true;
    }
    if (!playingBgmRef.current) {
      playingBgmRef.current = new Audio("/sounds/bgm-playing.mp3");
      playingBgmRef.current.loop = true;
    }

    const lobbyBgm = lobbyBgmRef.current;
    const playingBgm = playingBgmRef.current;
    const activeBgm = activeBgmMode === "playing" ? playingBgm : activeBgmMode === "lobby" ? lobbyBgm : null;
    const inactiveBgm = activeBgmMode === "playing" ? lobbyBgm : playingBgm;
    lobbyBgm.volume = lobbyVolume;
    playingBgm.volume = gameVolume;
    inactiveBgm.pause();
    inactiveBgm.currentTime = 0;

    if (!activeBgm || activeVolume <= 0) {
      activeBgm?.pause();
      return;
    }

    const playBgm = () => {
      void activeBgm.play().catch(() => {
        if (unlockBgmRef.current) return;
        unlockBgmRef.current = () => {
          void activeBgm.play().catch(() => {});
          if (unlockBgmRef.current) {
            document.removeEventListener("pointerdown", unlockBgmRef.current);
            unlockBgmRef.current = null;
          }
        };
        document.addEventListener("pointerdown", unlockBgmRef.current, { once: true });
      });
    };

    playBgm();

    return () => {
      if (unlockBgmRef.current) {
        document.removeEventListener("pointerdown", unlockBgmRef.current);
        unlockBgmRef.current = null;
      }
    };
  }, [activeBgmMode, activeVolume, gameVolume, lobbyVolume]);

  const value = useMemo(
    () => ({
      lobbyVolume,
      gameVolume,
      effectVolume,
      setLobbyVolume,
      setGameVolume,
      setEffectVolume,
      setBgmMode: setRequestedBgmMode,
      playSound
    }),
    [effectVolume, gameVolume, lobbyVolume, playSound, setEffectVolume, setGameVolume, setLobbyVolume]
  );

  return <SoundContext.Provider value={value}>{children}</SoundContext.Provider>;
}

export function useSoundControls() {
  const context = useContext(SoundContext);
  if (!context) throw new Error("useSoundControls must be used inside SoundProvider.");
  return context;
}

export function useBgmMode(mode: BgmMode) {
  const { setBgmMode } = useSoundControls();

  useEffect(() => {
    setBgmMode(mode);
    return () => setBgmMode(null);
  }, [mode, setBgmMode]);
}

function clampVolume(volume: number) {
  return Math.min(1, Math.max(0, volume));
}

function createSoundPool(sound: SoundName, size: number) {
  return Array.from({ length: size }, () => {
    const audio = new Audio(soundFiles[sound]);
    audio.preload = "auto";
    audio.load();
    return audio;
  });
}
