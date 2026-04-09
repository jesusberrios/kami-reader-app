export type AnimState = 'idle' | 'walk' | 'jump' | 'fall';
export type MoodState = 'curious' | 'happy' | 'sleepy';
export type LoopMode = 'forward' | 'pingpong';

export type AnimConfig = {
    source: any;
    sheetFrames: number;
    frameWidth?: number;
    frameHeight?: number;
    frameIndices: number[];
    fps: number;
    fpsReduced: number;
    loopMode: LoopMode;
};

export type CompanionProfile = {
    id: string;
    displayName: string;
    aliases: string[];
    linesByMood: Record<MoodState, string[]>;
    anims: Record<AnimState, AnimConfig>;
    /** Pixels the sprite image is shifted down inside the viewport. Bunny uses 7 to absorb transparent bottom padding. Cats use 0. */
    yOffset?: number;
};

const createCatProfile = ({
    id,
    displayName,
    aliases,
    idleSource,
    walkSource,
    jumpSource,
    flavor,
}: {
    id: string;
    displayName: string;
    aliases: string[];
    idleSource: any;
    walkSource: any;
    jumpSource: any;
    flavor: string;
}): CompanionProfile => ({
    id,
    displayName,
    aliases,
    yOffset: 0,
    linesByMood: {
        curious: [
            `Miau... ${flavor} tiene algo interesante.`,
            'Estoy vigilando cada panel contigo.',
            'Cat mode curioso activado.',
            'Shonen, isekai, romance... que lees hoy?',
            'Los manhwa verticales o el manga clasico? Los dos son finos.',
            'Ese arco que estas leyendo se nota que esta bueno.',
            'Noto que tienes un genero favorito... cual sera?',
            'Webtoon o manga tradicional, igual te sigo leyendo.',
        ],
        happy: [
            `Purr... ${flavor} se ve increible hoy.`,
            'Que buen maraton de lectura llevamos.',
            'Tu ritmo esta precioso, sigueme.',
            'Capitulo tras capitulo, tu dedicacion me hace muy feliz.',
            'Lector de manhwa o manga clasico, igual eres crack.',
            'Ese favorito que sigues... sigue pendiente, lo noto.',
            'Tu lista de favoritos va creciendo, gran coleccion.',
            'Isekai, accion, romance... lees de todo y se nota.',
        ],
        sleepy: [
            'Un mini ronroneo y seguimos leyendo.',
            'Voy suavecito, pero no me voy.',
            'Modo siesta corta, modo lectura larga.',
            'Descansa los ojos... los proximos capitulos siguen esperando.',
            'Hasta el slice of life mas tranquilo me da suenito a veces.',
            'Pausa corta, respira, y volvemos al manga.',
        ],
    },
    anims: {
        idle: {
            source: idleSource,
            sheetFrames: 4,
            frameIndices: [0, 1, 2, 3],
            fps: 3,
            fpsReduced: 2,
            loopMode: 'pingpong',
        },
        walk: {
            source: walkSource,
            sheetFrames: 6,
            frameIndices: [0, 1, 2, 3, 4, 5],
            fps: 7,
            fpsReduced: 4,
            loopMode: 'pingpong',
        },
        jump: {
            source: jumpSource,
            sheetFrames: 3,
            frameIndices: [0, 1, 2],
            fps: 4,
            fpsReduced: 3,
            loopMode: 'forward',
        },
        fall: {
            source: jumpSource,
            sheetFrames: 3,
            frameIndices: [2, 1, 0],
            fps: 4,
            fpsReduced: 2,
            loopMode: 'forward',
        },
    },
});

const BUNNY_PROFILE: CompanionProfile = {
    id: 'kami-bunny',
    displayName: 'Kami Bunny',
    aliases: ['kami-bunny', 'bunny', 'conejo', 'easter-bunny', 'pascua-bunny'],
    linesByMood: {
        curious: [
            'Hmm... aqui hay algo interesante.',
            'Te sigo, quiero ver que lees hoy.',
            'Oli una historia nueva por aqui.',
        ],
        happy: [
            'Me encanta verte leer asi de seguido.',
            'Hoy estamos on fire.',
            'Que bonito ritmo, vamos genial.',
        ],
        sleepy: [
            'Voy lento un ratito... pero sigo contigo.',
            'Mini pausa y seguimos.',
            'Modo tranquilito activado.',
            'Descansa un rato, los mangas no se van a ninguna parte.',
            'Un respiro entre capitulos viene bien.',
        ],
    },
    yOffset: 7,
    anims: {
        idle: {
            source: require('../../assets/pascua/bunny/bunnyIdle.png'),
            sheetFrames: 6,
            frameIndices: [0],
            fps: 1,
            fpsReduced: 1,
            loopMode: 'forward',
        },
        walk: {
            source: require('../../assets/pascua/bunny/bunnyWalk.png'),
            sheetFrames: 10,
            frameIndices: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
            fps: 5,
            fpsReduced: 3,
            loopMode: 'pingpong',
        },
        jump: {
            source: require('../../assets/pascua/bunny/bunnyJump.png'),
            sheetFrames: 6,
            frameIndices: [0, 1, 2],
            fps: 4,
            fpsReduced: 3,
            loopMode: 'forward',
        },
        fall: {
            source: require('../../assets/pascua/bunny/bunnyJump.png'),
            sheetFrames: 6,
            frameIndices: [3, 4, 5],
            fps: 3,
            fpsReduced: 2,
            loopMode: 'forward',
        },
    },
};

const HALLOWEEN_CAT_PROFILE = createCatProfile({
    id: 'halloween-cat',
    displayName: 'Cat Halloween',
    aliases: ['halloween-cat'],
    idleSource: require('../../assets/halloween/cat/catIdleHalloween.png'),
    walkSource: require('../../assets/halloween/cat/catWalkHalloween.png'),
    jumpSource: require('../../assets/halloween/cat/catJumpHalloween.png'),
    flavor: 'Halloween',
});

const XMAS_CAT_PROFILE = createCatProfile({
    id: 'navidad-cat',
    displayName: 'Cat Navidad',
    aliases: ['navidad-cat', 'xmas-cat', 'christmas-cat'],
    idleSource: require('../../assets/navidad/cat/catIdleNavidad.png'),
    walkSource: require('../../assets/navidad/cat/catWalkNavidad.png'),
    jumpSource: require('../../assets/navidad/cat/catJumpNavidad.png'),
    flavor: 'Navidad',
});

const VALENTINE_CAT_PROFILE = createCatProfile({
    id: 'valentine-cat',
    displayName: 'Cat Valentin',
    aliases: ['valentine-cat', 'valentin-cat', 'sanvalentin-cat'],
    idleSource: require('../../assets/sanvalentin/cat/catIdleValentin.png'),
    walkSource: require('../../assets/sanvalentin/cat/catWalkValentin.png'),
    jumpSource: require('../../assets/sanvalentin/cat/catJumpValentin.png'),
    flavor: 'San Valentin',
});

// Centralized registry for scalable growth: add one entry per new pet.
export const COMPANION_REGISTRY: CompanionProfile[] = [
    XMAS_CAT_PROFILE,
    HALLOWEEN_CAT_PROFILE,
    VALENTINE_CAT_PROFILE,
    BUNNY_PROFILE,
];

export const DEFAULT_COMPANION_PROFILE = BUNNY_PROFILE;

export const resolveCompanionProfile = (selectedCompanionKey: string | null | undefined): CompanionProfile => {
    if (!selectedCompanionKey) return DEFAULT_COMPANION_PROFILE;
    const normalized = selectedCompanionKey.toLowerCase().trim();
    return (
        COMPANION_REGISTRY.find((profile) => profile.aliases.some((alias) => normalized.includes(alias))) ||
        DEFAULT_COMPANION_PROFILE
    );
};
